import DetailedLedger from "./DetailedLedger";
import type { Business } from "./api";
export default function AccountLedger({ business, accountId, onClose, onSessionExpired }: { business: Business; accountId: string; onClose: () => void; onSessionExpired: () => void }) {
  return <DetailedLedger key={`${business.id}:${accountId}`} business={business} kind="account" subjectId={accountId} onClose={onClose} onSessionExpired={onSessionExpired} />;
}
