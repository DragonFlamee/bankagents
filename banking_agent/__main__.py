"""Run the demo locally: python -m banking_agent."""
import argparse
import uvicorn
from .api import create_app


def main():
    parser = argparse.ArgumentParser(description="TraceBank local simulated banking agent")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--data-dir")
    args = parser.parse_args()
    uvicorn.run(create_app(args.data_dir), host=args.host, port=args.port)


if __name__ == "__main__":
    main()
