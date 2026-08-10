/**
 * Supabase 스키마 타입.
 * supabase/migrations/0001_schema.sql 과 손으로 맞춰 둔 것이다.
 * 스키마를 바꾸면 이 파일도 같이 고쳐야 한다.
 *
 * (Supabase CLI 를 쓰면 아래 명령으로 자동 생성할 수도 있다)
 *   npx supabase gen types typescript --project-id <ref> > src/types/database.ts
 */

export type Role = 'super_admin' | 'admin' | 'member';
export type MemberStatus = 'pending' | 'active' | 'inactive';
export type EventStatus = 'open' | 'closed' | 'cancelled';
export type PaymentStatus = 'paid' | 'unpaid' | 'exempt';
/** vote_options.code. 기본 3개 + 확장용 3개 */
export type VoteCode = 'attend' | 'absent' | 'maybe' | 'late' | 'early_leave' | 'guest';

export type Profile = {
  id: string;
  user_id: string;
  name: string;
  nickname: string | null;
  phone: string | null;
  role: Role;
  status: MemberStatus;
  created_at: string;
  updated_at: string;
};

export type TeamEvent = {
  id: string;
  title: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  venue_name: string | null;
  venue_address: string | null;
  map_url: string | null;
  description: string | null;
  vote_open_at: string;
  vote_deadline: string | null;
  max_attendees: number | null;
  allowed_votes: VoteCode[];
  attendee_list_visible: boolean;
  include_attendance_stats: boolean;
  status: EventStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type EventVote = {
  id: string;
  event_id: string;
  member_id: string;
  vote: VoteCode;
  guest_count: number;
  memo: string | null;
  created_at: string;
  updated_at: string;
};

export type VoteOption = {
  code: VoteCode;
  label: string;
  counts_as_attendance: boolean;
  sort_order: number;
  is_active: boolean;
};

export type MembershipPayment = {
  id: string;
  member_id: string;
  year: number;
  month: number;
  amount: number;
  payment_date: string | null;
  status: PaymentStatus;
  memo: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Expense = {
  id: string;
  expense_date: string;
  category: string;
  description: string;
  amount: number;
  memo: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AppSetting = {
  key: string;
  value: unknown;
  updated_by: string | null;
  updated_at: string;
};

export type AdminAuditLog = {
  id: number;
  actor_id: string | null;
  action: string;
  target_table: string | null;
  target_id: string | null;
  detail: unknown;
  created_at: string;
};

export type AttendanceStat = {
  member_id: string;
  name: string;
  nickname: string | null;
  attend_count: number;
  absent_count: number;
  maybe_count: number;
  no_vote_count: number;
  total_events: number;
  attendance_rate: number;
};

/** createClient<Database> 에 넘기는 제네릭 타입 */
type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<Profile, Pick<Profile, 'user_id' | 'name'> & Partial<Profile>>;
      events: Table<TeamEvent, Pick<TeamEvent, 'title' | 'event_date'> & Partial<TeamEvent>>;
      event_votes: Table<
        EventVote,
        Pick<EventVote, 'event_id' | 'member_id' | 'vote'> & Partial<EventVote>
      >;
      vote_options: Table<VoteOption>;
      membership_payments: Table<
        MembershipPayment,
        Pick<MembershipPayment, 'member_id' | 'year' | 'month'> & Partial<MembershipPayment>
      >;
      expenses: Table<
        Expense,
        Pick<Expense, 'expense_date' | 'description' | 'amount'> & Partial<Expense>
      >;
      app_settings: Table<AppSetting>;
      admin_audit_logs: Table<AdminAuditLog>;
    };
    Views: Record<string, never>;
    Functions: {
      get_attendance_stats: {
        Args: { from_date?: string | null; to_date?: string | null };
        Returns: AttendanceStat[];
      };
      admin_set_member_role: {
        Args: { target_profile_id: string; new_role: 'admin' | 'member' };
        Returns: Profile;
      };
      admin_set_member_status: {
        Args: { target_profile_id: string; new_status: MemberStatus };
        Returns: Profile;
      };
      admin_delete_member: {
        Args: { target_profile_id: string };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
