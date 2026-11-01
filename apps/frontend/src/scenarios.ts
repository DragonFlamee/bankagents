import {
  Wallet,
  CalendarClock,
  Users,
  FileText,
  PiggyBank,
  CreditCard,
  Repeat,
  Gift,
} from "lucide-react";
export const scenarios = [
  {
    name: "转账",
    icon: Wallet,
    prompt: "给李娜转 300 元",
    desc: "按名字或手机号找人，同名会先问清楚",
  },
  {
    name: "预约转账",
    icon: CalendarClock,
    prompt: "每月10号给妈妈转1000元",
    desc: "指定日期或每月固定一天，到期自动执行",
  },
  {
    name: "AA 收款",
    icon: Users,
    prompt: "晚饭680元和王明、李娜AA",
    desc: "按分精确拆分，零头算发起人",
  },
  {
    name: "账单洞察",
    icon: FileText,
    prompt: "分析本月账单，看看有哪些异常消费",
    desc: "收支流向、分类变化和需要核对的交易",
  },
  {
    name: "理财",
    icon: PiggyBank,
    prompt: "帮我推荐一下理财产品",
    desc: "按风险测评匹配，对比收益、回撤和流动性",
  },
  {
    name: "卡片管理",
    icon: CreditCard,
    prompt: "查询我的卡片",
    desc: "冻结、挂失、调额度、交易限制",
  },
  {
    name: "订阅扣费",
    icon: Repeat,
    prompt: "有哪些可以订阅的服务",
    desc: "识别周期扣费、查询签约代扣、设置提醒和取消订阅",
  },
  {
    name: "生日安排",
    icon: Gift,
    prompt: "我爱人生日快到了，这个月帮我锁定1000元活期，生日前2天订鲜花和蛋糕",
    desc: "锁定资金、预约订花订蛋糕，一句话串起来",
  },
];
