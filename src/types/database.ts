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
export type MatchType = 'season' | 'regular' | 'etc';
export type AttendanceStatus = 'present' | 'late' | 'absent' | 'no_show';
export type PaymentStatus = 'paid' | 'unpaid' | 'exempt';
/** vote_options.code. 기본 3개 + 확장용 3개 */
export type VoteCode = 'attend' | 'absent' | 'maybe' | 'late' | 'early_leave' | 'guest';

export type Profile = {
  id: string;
  user_id: string;
  /** 로그인 아이디. 내부적으로 `<login_id>@fccrossbar.local` 계정이 만들어진다. */
  login_id: string | null;
  name: string;
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
  venue_id: string | null;
  venue_name: string | null;
  venue_address: string | null;
  map_url: string | null;
  match_type: MatchType;
  /**
   * 시즌 경기일 때만 채운다. events_season_match_check 가
   * match_type='season' 이면 season_id·양 팀 모두 있고 두 팀이 달라야 한다고 강제한다.
   */
  season_id: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  /** events_score_check: 둘 다 null 이거나 둘 다 값이 있어야 한다 */
  home_score: number | null;
  away_score: number | null;
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

export type Venue = {
  id: string;
  name: string;
  address: string | null;
  map_url: string | null;
  memo: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type EventAttendance = {
  id: string;
  event_id: string;
  member_id: string;
  status: AttendanceStatus;
  memo: string | null;
  recorded_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SeasonStatus = 'upcoming' | 'active' | 'closed';

export type Season = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: SeasonStatus;
  memo: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SeasonTeam = {
  id: string;
  season_id: string;
  team_id: string;
  created_at: string;
};

/** 시즌별 명단. season_team_id 와 season_id 를 함께 들고 복합 FK 로 묶여 있다. */
export type SeasonTeamMember = {
  id: string;
  season_id: string;
  season_team_id: string;
  member_id: string;
  created_at: string;
};

export type Team = {
  id: string;
  name: string;
  color: string | null;
  memo: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

/** get_teams_with_base_roster() 결과. member_count 는 기본 명단 인원수. */
export type TeamWithRoster = {
  id: string;
  name: string;
  color: string | null;
  memo: string | null;
  sort_order: number;
  is_active: boolean;
  member_count: number;
};

/** 시즌과 무관한 기본 명단. 시즌별 명단(team_members)과 다른 테이블이다. */
export type TeamBaseMember = {
  id: string;
  team_id: string;
  member_id: string;
  created_at: string;
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

/**
 * 연납. membership_payments 는 (member_id, year, month) 가 NOT NULL 이라
 * 연납을 끼워 넣을 수 없어서 별도 테이블이다.
 */
export type AnnualPayment = {
  id: string;
  member_id: string;
  year: number;
  amount: number;
  payment_date: string | null;
  memo: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** 스탯 항목은 컬럼이 아니라 데이터다. 화면에서 하드코딩하지 말 것. */
export type StatType = {
  code: string;
  label: string;
  /** 한 경기에 여러 번 셀 수 있는가 (득점=여러 개, MOM=한 번) */
  is_countable: boolean;
  sort_order: number;
  is_active: boolean;
};

export type MemberMatchStat = {
  id: string;
  event_id: string;
  member_id: string;
  stat_type: string;
  value: number;
  memo: string | null;
  recorded_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SeasonStanding = {
  team_id: string;
  team_name: string;
  played: number;
  win: number;
  draw: number;
  loss: number;
  goals_for: number;
  goals_against: number;
  goal_diff: number;
  points: number;
};

export type MemberStatTotal = {
  member_id: string;
  name: string;
  stat_type: string;
  total: number;
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
  present_count: number;
  late_count: number;
  absent_count: number;
  no_show_count: number;
  /** 출석 체크가 끝난 경기 수 = 참석률의 분모 */
  recorded_events: number;
  attendance_rate: number;
  attend_vote_count: number;
  voted_count: number;
  vote_target_events: number;
  vote_response_rate: number;
};

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
      teams: Table<Team, Pick<Team, 'name'> & Partial<Team>>;
      seasons: Table<Season, Pick<Season, 'name' | 'start_date' | 'end_date'> & Partial<Season>>;
      season_teams: Table<
        SeasonTeam,
        Pick<SeasonTeam, 'season_id' | 'team_id'> & Partial<SeasonTeam>
      >;
      team_members: Table<
        SeasonTeamMember,
        Pick<SeasonTeamMember, 'season_id' | 'season_team_id' | 'member_id'> &
          Partial<SeasonTeamMember>
      >;
      team_base_members: Table<
        TeamBaseMember,
        Pick<TeamBaseMember, 'team_id' | 'member_id'> & Partial<TeamBaseMember>
      >;
      venues: Table<Venue, Pick<Venue, 'name'> & Partial<Venue>>;
      event_attendance: Table<
        EventAttendance,
        Pick<EventAttendance, 'event_id' | 'member_id' | 'status'> & Partial<EventAttendance>
      >;
      membership_payments: Table<
        MembershipPayment,
        Pick<MembershipPayment, 'member_id' | 'year' | 'month'> & Partial<MembershipPayment>
      >;
      membership_annual_payments: Table<
        AnnualPayment,
        Pick<AnnualPayment, 'member_id' | 'year' | 'amount'> & Partial<AnnualPayment>
      >;
      stat_types: Table<StatType>;
      member_match_stats: Table<
        MemberMatchStat,
        Pick<MemberMatchStat, 'event_id' | 'member_id' | 'stat_type'> & Partial<MemberMatchStat>
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
      get_teams_with_base_roster: {
        Args: Record<string, never>;
        Returns: TeamWithRoster[];
      };
      get_finance_summary: {
        Args: { p_year?: number | null; p_month?: number | null };
        Returns: {
          total_income: number;
          total_expense: number;
          balance: number;
          month_income: number;
          month_expense: number;
          unpaid_count: number;
        }[];
      };
      admin_copy_season_roster: {
        Args: { from_season_id: string; to_season_id: string };
        Returns: number;
      };
      get_season_standings: {
        Args: { p_season_id: string };
        Returns: SeasonStanding[];
      };
      // from_date / to_date 는 p_ 접두사가 없고 p_season_id 만 있다. 마이그레이션과 정확히 같아야 하며
      // 이름이 하나라도 틀리면 PGRST202(함수 없음)로 실패한다.
      get_member_stat_totals: {
        Args: { from_date?: string | null; to_date?: string | null; p_season_id?: string | null };
        Returns: MemberStatTotal[];
      };
      admin_seed_attendance_from_votes: {
        Args: { p_event_id: string };
        Returns: number;
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
