export type UserRole = "investor" | "admin";
export type KycStatus = "none" | "pending" | "approved" | "rejected";
export type ProjectStatus = "draft" | "open" | "funded" | "repaid" | "defaulted" | "cancelled";
export type InvestmentStatus =
  | "awaiting_deposit"
  | "partially_funded"
  | "funded"
  | "repaid"
  | "refunded"
  | "expired"
  | "defaulted";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  country: string | null;
  role: UserRole;
  kyc: KycStatus;
  accredited: boolean;
  payout_address: string | null;
  notify_new_projects: boolean;
  risk_ack_at: string | null;
  created_at: string;
};

export type Project = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  description: string | null;
  borrower: string;
  related_party: boolean;
  use_of_funds: string | null;
  collateral: string | null;
  target_amount: number;
  min_ticket: number;
  max_ticket: number | null;
  return_pct: number;
  term_days: number;
  opens_at: string;
  closes_at: string;
  funded_at: string | null;
  matures_at: string | null;
  status: ProjectStatus;
  raised_amount: number;
  created_at: string;
};

export type Investment = {
  id: string;
  project_id: string;
  user_id: string;
  committed_amount: number;
  received_amount: number;
  deposit_index: number;
  deposit_address: string | null;
  expected_amount: number | null;
  status: InvestmentStatus;
  payout_amount: number | null;
  payout_tx: string | null;
  paid_at: string | null;
  created_at: string;
};

export type Deposit = {
  id: string;
  investment_id: string;
  chain_id: number;
  token: string;
  tx_hash: string;
  log_index: number;
  from_address: string | null;
  amount: number;
  block_number: number;
  created_at: string;
};
