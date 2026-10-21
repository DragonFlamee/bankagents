"""Trusted worker for a deliberately small, numeric expression language.

This is not a general Python execution engine. No expression is passed to eval,
exec, compile, or a Python code object. File/network access and object attributes
have no representation in the language. OS resource controls are additional
containment; they are not filesystem/network namespaces.
"""

from __future__ import annotations

import ast
import json
import math
import sys


MAX_SOURCE = 4096
MAX_ITEMS = 10_000
MAX_LITERAL_ITEMS = 256
MAX_NODES = 256
MAX_DEPTH = 24
MAX_INPUT_BYTES = 262_144
MAX_OUTPUT_BYTES = 262_144
MAX_INTEGER_BITS = 64


class Rejected(ValueError):
    """Expression is outside the numeric language or its resource budget."""


def checked_number(value):
    if type(value) is int:
        if value.bit_length() > MAX_INTEGER_BITS:
            raise Rejected("integer exceeds the 64-bit magnitude budget")
    elif type(value) is float:
        if not math.isfinite(value) or abs(value) > 1e18:
            raise Rejected("non-finite or excessive floating-point result")
    else:
        raise Rejected("only numbers are allowed here")
    return value


def checked_sequence(value):
    if type(value) not in (tuple, list) or len(value) > MAX_ITEMS:
        raise Rejected("expected a bounded numeric sequence")
    for item in value:
        checked_number(item)
    return value


class NumericInterpreter:
    def __init__(self, amounts):
        if type(amounts) is not list or len(amounts) > MAX_ITEMS:
            raise Rejected("amounts must be a list with at most 10000 integers")
        if any(type(v) is not int or abs(v) > 10**12 for v in amounts):
            raise Rejected("amounts must contain integers within +/- 10^12")
        self.amounts = tuple(amounts)

    def run(self, source):
        if type(source) is not str or not source.strip() or len(source) > MAX_SOURCE:
            raise Rejected("expression must contain 1-4096 characters")
        try:
            tree = ast.parse(source, mode="eval")
        except (SyntaxError, ValueError, RecursionError) as exc:
            raise Rejected("not a valid numeric expression") from exc
        if sum(1 for _ in ast.walk(tree)) > MAX_NODES:
            raise Rejected("expression contains too many syntax nodes")
        return self.visit(tree.body, 0)

    def visit(self, node, depth):
        if depth > MAX_DEPTH:
            raise Rejected("expression exceeds the depth limit")
        if isinstance(node, ast.Constant):
            return checked_number(node.value)
        if isinstance(node, ast.Name):
            if node.id != "amounts":
                raise Rejected("unknown variable")
            return self.amounts
        if isinstance(node, (ast.List, ast.Tuple)):
            if len(node.elts) > MAX_LITERAL_ITEMS:
                raise Rejected("literal sequence exceeds its limit")
            return tuple(checked_number(self.visit(item, depth + 1)) for item in node.elts)
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
            value = checked_number(self.visit(node.operand, depth + 1))
            return checked_number(-value if isinstance(node.op, ast.USub) else value)
        if isinstance(node, ast.BinOp):
            left = checked_number(self.visit(node.left, depth + 1))
            right = checked_number(self.visit(node.right, depth + 1))
            if isinstance(node.op, ast.Add):
                value = left + right
            elif isinstance(node.op, ast.Sub):
                value = left - right
            elif isinstance(node.op, ast.Mult):
                value = left * right
            elif isinstance(node.op, ast.Div):
                value = left / right
            elif isinstance(node.op, ast.FloorDiv):
                value = left // right
            elif isinstance(node.op, ast.Mod):
                value = left % right
            elif isinstance(node.op, ast.Pow):
                if type(right) is not int or not -6 <= right <= 12 or abs(left) > 10**6:
                    raise Rejected("exponent or base exceeds the power budget")
                value = left**right
            else:
                raise Rejected("operator is not available")
            return checked_number(value)
        if isinstance(node, ast.Call):
            if not isinstance(node.func, ast.Name) or node.keywords:
                raise Rejected("only direct calls to approved numeric functions are allowed")
            if len(node.args) > 8:
                raise Rejected("too many function arguments")
            name = node.func.id
            if name not in {"sum", "len", "min", "max", "abs", "round", "sorted"}:
                raise Rejected("function is not available")
            args = [self.visit(arg, depth + 1) for arg in node.args]
            if name in {"sum", "len", "sorted"}:
                if len(args) != 1:
                    raise Rejected("this function requires one sequence")
                seq = checked_sequence(args[0])
                if name == "len":
                    return len(seq)
                if name == "sorted":
                    return tuple(sorted(seq))
                return checked_number(sum(seq))
            if name in {"min", "max"}:
                if not args:
                    raise Rejected("min/max require values")
                seq = checked_sequence(args[0]) if len(args) == 1 else [checked_number(v) for v in args]
                if not seq:
                    raise Rejected("min/max of empty data is undefined")
                return checked_number(min(seq) if name == "min" else max(seq))
            if name == "abs":
                if len(args) != 1:
                    raise Rejected("abs requires one number")
                return checked_number(abs(checked_number(args[0])))
            if not 1 <= len(args) <= 2:
                raise Rejected("round requires one number and optional precision")
            value = checked_number(args[0])
            precision = args[1] if len(args) == 2 else 0
            if type(precision) is not int or not -6 <= precision <= 6:
                raise Rejected("round precision must be an integer from -6 to 6")
            return checked_number(round(value, precision))
        raise Rejected("syntax is not part of the numeric language")


def apply_posix_limits():
    """Set resource limits before accepting untrusted input; errors fail closed."""
    import resource

    resource.setrlimit(resource.RLIMIT_AS, (128 * 1024 * 1024,) * 2)
    resource.setrlimit(resource.RLIMIT_CPU, (2, 2))
    resource.setrlimit(resource.RLIMIT_FSIZE, (0, 0))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    if hasattr(resource, "RLIMIT_NPROC"):
        resource.setrlimit(resource.RLIMIT_NPROC, (1, 1))


def main():
    limited = sys.platform == "win32"
    try:
        if not limited:
            apply_posix_limits()
            limited = True
        raw = sys.stdin.buffer.read(MAX_INPUT_BYTES + 1)
        if len(raw) > MAX_INPUT_BYTES:
            raise Rejected("input exceeds the byte limit")
        payload = json.loads(raw)
        if type(payload) is not dict or set(payload) != {"code", "amounts"}:
            raise Rejected("invalid worker input")
        result = NumericInterpreter(payload["amounts"]).run(payload["code"])
        response = {"status": "succeeded", "result": result, "resource_limits": limited}
    except (Rejected, ArithmeticError, TypeError, ValueError, RecursionError) as exc:
        response = {"status": "rejected", "error": str(exc)[:200], "resource_limits": limited}
    except (MemoryError, OSError):
        response = {"status": "failed", "error": "worker resource setup or execution failed", "resource_limits": limited}
    output = json.dumps(response, ensure_ascii=True, allow_nan=False, separators=(",", ":"))
    if len(output.encode("utf-8")) > MAX_OUTPUT_BYTES:
        output = json.dumps({"status": "rejected", "error": "output exceeds limit", "resource_limits": limited})
    sys.stdout.write(output)


if __name__ == "__main__":
    main()
