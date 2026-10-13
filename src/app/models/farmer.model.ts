export interface Farmer {
  id: number;
  name: string;
  village: string;
  sugarcane_supply_tons: number;
  total_amount: number;
  amount_paid: number;
  payment_pending: number;
}

export interface Stats {
  total_farmers: number;
  total_tons: number;
  total_amount: number;
  amount_paid: number;
  payment_pending: number;
  pending_farmers_count: number;
  fully_paid_farmers_count: number;
  paid_percentage: number;
  crushing_day: number;
  frp_rate_per_ton: number;
}

export interface WeighbridgeSlip {
  slip_id: string;
  farmer_id: number;
  farmer_name: string;
  village: string;
  vehicle_no: string;
  gross_tons: number;
  tare_tons: number;
  net_tons: number;
  brix_percentage: number;
  moisture_percentage: number;
  status: string;
  timestamp: string;
}

export interface CopilotResponse {
  question: string;
  answer: string;
  toolInvocation?: {
    name: string;
    args: any;
    durationMs: number;
  };
  totalDurationMs?: number;
}
