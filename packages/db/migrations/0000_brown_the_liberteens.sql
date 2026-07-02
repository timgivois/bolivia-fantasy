CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."player_position" AS ENUM('GK', 'DEF', 'MID', 'FWD');--> statement-breakpoint
CREATE TYPE "public"."round_phase" AS ENUM('apertura', 'clausura');--> statement-breakpoint
CREATE TYPE "public"."round_status" AS ENUM('upcoming', 'locked', 'live', 'finalized');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"image" text,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"provider" text,
	"provider_account_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "clubs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "clubs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"api_football_id" integer,
	"name" text NOT NULL,
	"short_name" text,
	"logo_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clubs_api_football_id_unique" UNIQUE("api_football_id"),
	CONSTRAINT "clubs_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "players_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"api_football_id" integer,
	"club_id" integer,
	"name" text NOT NULL,
	"position" "player_position" NOT NULL,
	"price" numeric(5, 1) NOT NULL,
	"photo_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_api_football_id_unique" UNIQUE("api_football_id")
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "rounds_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"season" integer NOT NULL,
	"name" text NOT NULL,
	"round_number" integer NOT NULL,
	"phase" "round_phase" NOT NULL,
	"lock_at" timestamp with time zone,
	"status" "round_status" DEFAULT 'upcoming' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fixtures" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "fixtures_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"api_football_id" integer NOT NULL,
	"round_id" integer NOT NULL,
	"home_club_id" integer NOT NULL,
	"away_club_id" integer NOT NULL,
	"kickoff_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'NS' NOT NULL,
	"home_goals" integer,
	"away_goals" integer,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fixtures_api_football_id_unique" UNIQUE("api_football_id")
);
--> statement-breakpoint
CREATE TABLE "player_fixture_stats" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "player_fixture_stats_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"player_id" integer NOT NULL,
	"fixture_id" integer NOT NULL,
	"minutes" integer DEFAULT 0 NOT NULL,
	"goals" integer DEFAULT 0 NOT NULL,
	"assists" integer DEFAULT 0 NOT NULL,
	"clean_sheet" boolean DEFAULT false NOT NULL,
	"goals_conceded" integer DEFAULT 0 NOT NULL,
	"penalties_saved" integer DEFAULT 0 NOT NULL,
	"penalties_missed" integer DEFAULT 0 NOT NULL,
	"yellow_cards" integer DEFAULT 0 NOT NULL,
	"red_cards" integer DEFAULT 0 NOT NULL,
	"own_goals" integer DEFAULT 0 NOT NULL,
	"saves" integer DEFAULT 0 NOT NULL,
	"rating" numeric(3, 1),
	"is_correction" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fantasy_squads" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "fantasy_squads_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"budget" numeric(6, 1) DEFAULT 100 NOT NULL,
	"total_points" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fantasy_squads_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "round_scores" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "round_scores_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"squad_id" integer NOT NULL,
	"round_id" integer NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"transfer_penalty" integer DEFAULT 0 NOT NULL,
	"bench_points" integer DEFAULT 0 NOT NULL,
	"finalized" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "squad_picks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "squad_picks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"squad_id" integer NOT NULL,
	"round_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"position" integer NOT NULL,
	"is_captain" boolean DEFAULT false NOT NULL,
	"is_vice_captain" boolean DEFAULT false NOT NULL,
	"purchase_price" numeric(5, 1) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "squad_picks_position_range" CHECK ("squad_picks"."position" BETWEEN 1 AND 15)
);
--> statement-breakpoint
CREATE TABLE "transfers" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "transfers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"squad_id" integer NOT NULL,
	"round_id" integer NOT NULL,
	"player_out_id" integer NOT NULL,
	"player_in_id" integer NOT NULL,
	"points_cost" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mini_league_members" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mini_league_members_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"league_id" integer NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mini_leagues" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mini_leagues_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"invite_code" varchar(8) NOT NULL,
	"owner_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mini_leagues_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
CREATE TABLE "api_request_log" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "api_request_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"date" date NOT NULL,
	"endpoint" text,
	"request_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_request_log_date_unique" UNIQUE("date")
);
--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_home_club_id_clubs_id_fk" FOREIGN KEY ("home_club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_away_club_id_clubs_id_fk" FOREIGN KEY ("away_club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_fixture_stats" ADD CONSTRAINT "player_fixture_stats_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_fixture_stats" ADD CONSTRAINT "player_fixture_stats_fixture_id_fixtures_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."fixtures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_squads" ADD CONSTRAINT "fantasy_squads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_scores" ADD CONSTRAINT "round_scores_squad_id_fantasy_squads_id_fk" FOREIGN KEY ("squad_id") REFERENCES "public"."fantasy_squads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_scores" ADD CONSTRAINT "round_scores_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "squad_picks" ADD CONSTRAINT "squad_picks_squad_id_fantasy_squads_id_fk" FOREIGN KEY ("squad_id") REFERENCES "public"."fantasy_squads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "squad_picks" ADD CONSTRAINT "squad_picks_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "squad_picks" ADD CONSTRAINT "squad_picks_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_squad_id_fantasy_squads_id_fk" FOREIGN KEY ("squad_id") REFERENCES "public"."fantasy_squads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_player_out_id_players_id_fk" FOREIGN KEY ("player_out_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_player_in_id_players_id_fk" FOREIGN KEY ("player_in_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mini_league_members" ADD CONSTRAINT "mini_league_members_league_id_mini_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."mini_leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mini_league_members" ADD CONSTRAINT "mini_league_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mini_leagues" ADD CONSTRAINT "mini_leagues_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_provider_account_unique" ON "users" USING btree ("provider","provider_account_id");--> statement-breakpoint
CREATE INDEX "players_club_id_idx" ON "players" USING btree ("club_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rounds_season_phase_number_unique" ON "rounds" USING btree ("season","phase","round_number");--> statement-breakpoint
CREATE INDEX "fixtures_round_id_idx" ON "fixtures" USING btree ("round_id");--> statement-breakpoint
CREATE INDEX "fixtures_home_club_id_idx" ON "fixtures" USING btree ("home_club_id");--> statement-breakpoint
CREATE INDEX "fixtures_away_club_id_idx" ON "fixtures" USING btree ("away_club_id");--> statement-breakpoint
CREATE INDEX "fixtures_kickoff_at_idx" ON "fixtures" USING btree ("kickoff_at");--> statement-breakpoint
CREATE UNIQUE INDEX "player_fixture_stats_player_fixture_unique" ON "player_fixture_stats" USING btree ("player_id","fixture_id");--> statement-breakpoint
CREATE INDEX "player_fixture_stats_player_id_idx" ON "player_fixture_stats" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "player_fixture_stats_fixture_id_idx" ON "player_fixture_stats" USING btree ("fixture_id");--> statement-breakpoint
CREATE UNIQUE INDEX "round_scores_squad_round_unique" ON "round_scores" USING btree ("squad_id","round_id");--> statement-breakpoint
CREATE INDEX "round_scores_round_id_idx" ON "round_scores" USING btree ("round_id");--> statement-breakpoint
CREATE UNIQUE INDEX "squad_picks_squad_round_player_unique" ON "squad_picks" USING btree ("squad_id","round_id","player_id");--> statement-breakpoint
CREATE INDEX "squad_picks_squad_round_idx" ON "squad_picks" USING btree ("squad_id","round_id");--> statement-breakpoint
CREATE INDEX "squad_picks_round_id_idx" ON "squad_picks" USING btree ("round_id");--> statement-breakpoint
CREATE INDEX "squad_picks_player_id_idx" ON "squad_picks" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "transfers_squad_round_idx" ON "transfers" USING btree ("squad_id","round_id");--> statement-breakpoint
CREATE INDEX "transfers_round_id_idx" ON "transfers" USING btree ("round_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mini_league_members_league_user_unique" ON "mini_league_members" USING btree ("league_id","user_id");--> statement-breakpoint
CREATE INDEX "mini_league_members_user_id_idx" ON "mini_league_members" USING btree ("user_id");