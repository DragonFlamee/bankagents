import {
  Wallet,
  FileText,
  CreditCard,
  Repeat,
  Target,
  Calculator,
} from "lucide-react";
export const scenarios = [
  {
    name: "转账",
    icon: Wallet,
    prompt: "给李娜转 300 元",
    desc: "联系人消歧、金额核对与分级授权",
  },
  {
    name: "账单洞察",
    icon: FileText,
    prompt: "请你帮我看看我应该在哪里省钱",
    desc: "分类支出、异常提示与有依据的建议",
  },
  {
    name: "卡片管理",
    icon: CreditCard,
    prompt: "查询我的卡片",
    desc: "查询、挂失、解挂及虚拟卡申请",
  },
  {
    name: "订阅管理",
    icon: Repeat,
    prompt: "查询我的订阅",
    desc: "征得同意后查询，取消前再次确认",
  },
  {
    name: "储蓄目标",
    icon: Target,
    prompt: "创建旅行储蓄目标 5000 元",
    desc: "记录目标，不冻结或自动划转资金",
  },
  {
    name: "受限分析",
    icon: Calculator,
    prompt: "用沙箱计算本月平均支出",
    desc: "白名单表达式计算，保留数据依据",
  },
];
