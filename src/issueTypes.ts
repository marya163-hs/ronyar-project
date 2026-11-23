export type IssueReport = {
  id: string;
  userId: string;
  businessId: string;
  title: string;
  steps: string;
  expected: string;
  actual: string;
  context: string;
  createdAt: string;
  updatedAt: string;
  decision: string;
  stage: string;
  kind: string;
  severity: string;
  duplicateOf: string | null;
  reply: string;
  version: number;
  requestKey: string;
  diagnostic: { requestId?: string; errorCode?: string };
  business?: { name: string };
  user?: { displayName: string };
};
export type IssueInput = {
  requestKey: string;
  title: string;
  steps: string;
  expected: string;
  actual: string;
  context: string;
  challengeId?: string;
  requestId?: string;
  errorCode?: string;
  method?: string;
};
export type IssueClaim = {
  id: string;
  userId: string;
  status: string;
  reference: string;
  version: number;
  accepted?: number;
  user?: { displayName: string };
};
export type IssueProgress = {
  accepted: number;
  threshold: number;
  rewardToman: string;
  campaign: null | {
    id: string;
    active: boolean;
    startsAt: string;
    endsAt: string;
    version: number;
  };
  claim: IssueClaim | null;
};
export const issueDecision: Record<string, string> = {
  PENDING: "در انتظار بررسی",
  ACCEPTED: "باگ تأییدشده",
  DUPLICATE: "تکراری",
  REJECTED: "تأیید نشد",
};
export const issueStage: Record<string, string> = {
  NEW: "جدید",
  REVIEWING: "در حال بررسی",
  FIX_READY: "اصلاح آماده",
  RELEASED: "اصلاح منتشرشده",
  RESOLVED: "رفع‌شده",
};
