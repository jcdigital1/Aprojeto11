// Hand-written mirrors of backend/models/schemas.py — keep in sync.
export type UserStatus = "pending" | "approved" | "blocked";

export interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "customer";
  status: UserStatus;
  created_at: string;
  approved_at: string | null;
}

export interface MessageOut {
  message: string;
}

export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Calibration {
  qrX: number;
  qrY: number;
  qrWidth: number;
  qrHeight: number;
  quietZone: number;
  cleanupRegion: Region;
  numberX: number;
  numberY: number;
  numberFontSize: number;
  numberColor: string;
  numberAlignment: "left" | "center" | "right";
}

export interface Template {
  id: string;
  name: string;
  original_url: string;
  clean_url: string;
  version: number;
  production_ready: boolean;
  calibration: Calibration;
  updated_at: string;
}

export interface RenderSnapshot {
  template_id: string;
  template_version: number;
  clean_url: string;
  calibration: Calibration;
}

export interface Batch {
  id: string;
  owner_id: string;
  name: string;
  template_id: string;
  template_name: string;
  template_version: number;
  render: RenderSnapshot;
  quantity: number;
  number_start: number;
  number_end: number;
  status: "creating" | "ready" | "failed";
  test_mode: boolean;
  created_at: string;
}

export interface Plaque {
  id: string;
  code: string;
  number: number;
  batch_id: string;
  batch_name: string;
  template_id: string;
  qr_url: string;
  destination_url: string;
  disabled: boolean;
  scan_count: number;
  test_mode: boolean;
  render: RenderSnapshot;
  created_at: string;
  updated_at: string;
}

export interface PlaquePage {
  items: Plaque[];
  total: number;
  page: number;
  page_size: number;
}

export interface MyStats {
  batches: number;
  plaques: number;
  configured: number;
  scans: number;
}

export interface AdminStats {
  pending: number;
  approved: number;
  blocked: number;
  batches: number;
  plaques: number;
  qr_issued: number;
  scans: number;
}

export interface PasswordResetRequest {
  id: string;
  user_id: string;
  email: string;
  name: string;
  created_at: string;
  link_generated: boolean;
}

export interface ResetLink {
  link: string;
  expires_at: string;
}

export interface Settings {
  public_base_url: string;
  production_confirmed: boolean;
  updated_at: string | null;
}

export interface AdminPlaque {
  id: string;
  code: string;
  number: number;
  owner_email: string;
  batch_name: string;
  destination_url: string;
  disabled: boolean;
  scan_count: number;
}
