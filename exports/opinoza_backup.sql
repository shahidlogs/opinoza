--
-- PostgreSQL database dump
--

\restrict XtmNYpiAzqZU0gmLknWfqqXt0x1vAKpMi4B28hvxMbZT17dIkAjNVSZudxrJkeR

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: answers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.answers (
    id integer NOT NULL,
    question_id integer NOT NULL,
    user_id text NOT NULL,
    answer_text text,
    poll_option text,
    rating integer,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: answers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.answers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: answers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.answers_id_seq OWNED BY public.answers.id;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id integer NOT NULL,
    user_id text NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    related_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;


--
-- Name: question_milestones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.question_milestones (
    id integer NOT NULL,
    question_id integer NOT NULL,
    milestone integer NOT NULL,
    reward_cents double precision NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: question_milestones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.question_milestones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: question_milestones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.question_milestones_id_seq OWNED BY public.question_milestones.id;


--
-- Name: questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.questions (
    id integer NOT NULL,
    title text NOT NULL,
    description text,
    type text NOT NULL,
    category text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    poll_options text[],
    creator_id text,
    creator_name text,
    is_custom boolean DEFAULT false NOT NULL,
    total_answers integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_profile_question boolean DEFAULT false NOT NULL
);


--
-- Name: questions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.questions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: questions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.questions_id_seq OWNED BY public.questions.id;


--
-- Name: referral_clicks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referral_clicks (
    id integer NOT NULL,
    referral_code text NOT NULL,
    referrer_user_id text,
    ip_address text,
    user_agent text,
    session_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: referral_clicks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.referral_clicks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: referral_clicks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.referral_clicks_id_seq OWNED BY public.referral_clicks.id;


--
-- Name: referrals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referrals (
    id integer NOT NULL,
    referrer_user_id text NOT NULL,
    referred_user_id text NOT NULL,
    referral_code_used text NOT NULL,
    signup_bonus_cents double precision DEFAULT 10 NOT NULL,
    answer_bonus_cents_total double precision DEFAULT 0 NOT NULL,
    signup_bonus_granted_at timestamp with time zone,
    referrer_click_ip text,
    referred_signup_ip text,
    referred_user_agent text,
    status text DEFAULT 'approved'::text NOT NULL,
    fraud_flags jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: referrals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.referrals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: referrals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.referrals_id_seq OWNED BY public.referrals.id;


--
-- Name: transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transactions (
    id integer NOT NULL,
    user_id text NOT NULL,
    type text NOT NULL,
    amount_cents double precision NOT NULL,
    description text NOT NULL,
    status text DEFAULT 'completed'::text NOT NULL,
    related_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.transactions_id_seq OWNED BY public.transactions.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    clerk_id text NOT NULL,
    email text NOT NULL,
    name text,
    city text,
    age_group text,
    gender text,
    is_admin boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    name_rewarded boolean DEFAULT false NOT NULL,
    city_rewarded boolean DEFAULT false NOT NULL,
    age_group_rewarded boolean DEFAULT false NOT NULL,
    gender_rewarded boolean DEFAULT false NOT NULL,
    referral_code text,
    referred_by_user_id text,
    signup_ip text,
    user_agent text
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: wallets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wallets (
    id integer NOT NULL,
    user_id text NOT NULL,
    balance_cents double precision DEFAULT 0 NOT NULL,
    total_earned_cents double precision DEFAULT 0 NOT NULL,
    total_withdrawn_cents double precision DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: wallets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wallets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wallets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wallets_id_seq OWNED BY public.wallets.id;


--
-- Name: answers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.answers ALTER COLUMN id SET DEFAULT nextval('public.answers_id_seq'::regclass);


--
-- Name: notifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications ALTER COLUMN id SET DEFAULT nextval('public.notifications_id_seq'::regclass);


--
-- Name: question_milestones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_milestones ALTER COLUMN id SET DEFAULT nextval('public.question_milestones_id_seq'::regclass);


--
-- Name: questions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questions ALTER COLUMN id SET DEFAULT nextval('public.questions_id_seq'::regclass);


--
-- Name: referral_clicks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_clicks ALTER COLUMN id SET DEFAULT nextval('public.referral_clicks_id_seq'::regclass);


--
-- Name: referrals id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals ALTER COLUMN id SET DEFAULT nextval('public.referrals_id_seq'::regclass);


--
-- Name: transactions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions ALTER COLUMN id SET DEFAULT nextval('public.transactions_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: wallets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallets ALTER COLUMN id SET DEFAULT nextval('public.wallets_id_seq'::regclass);


--
-- Data for Name: answers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.answers (id, question_id, user_id, answer_text, poll_option, rating, reason, created_at) FROM stdin;
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.notifications (id, user_id, type, title, message, is_read, related_id, created_at) FROM stdin;
\.


--
-- Data for Name: question_milestones; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.question_milestones (id, question_id, milestone, reward_cents, created_at) FROM stdin;
\.


--
-- Data for Name: questions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.questions (id, title, description, type, category, status, poll_options, creator_id, creator_name, is_custom, total_answers, created_at, updated_at, is_profile_question) FROM stdin;
66	How do you rate your McDonald's experience?	Overall rating for food quality, speed, and value for money.	rating	Food & Dining	active	\N	\N	\N	f	0	2026-04-06 14:39:33.960455+00	2026-04-06 14:39:33.960455+00	f
67	Rate your current mobile network provider	Consider call quality, data speed, coverage, and customer support.	rating	Technology	active	\N	\N	\N	f	0	2026-04-06 14:39:33.960455+00	2026-04-06 14:39:33.960455+00	f
68	How would you rate Netflix as a streaming platform?	Content library, interface, pricing, and overall value.	rating	Entertainment	active	\N	\N	\N	f	0	2026-04-06 14:39:33.960455+00	2026-04-06 14:39:33.960455+00	f
69	Rate Uber or your local ride-hailing service	Consider driver quality, wait times, pricing, and app experience.	rating	Transportation	active	\N	\N	\N	f	0	2026-04-06 14:39:33.960455+00	2026-04-06 14:39:33.960455+00	f
70	How satisfied are you with your home internet provider?	Speed, reliability, customer support, and value for money.	rating	Technology	active	\N	\N	\N	f	0	2026-04-06 14:39:33.960455+00	2026-04-06 14:39:33.960455+00	f
71	Rate Amazon's shopping experience	Delivery speed, product selection, pricing, and ease of use.	rating	Shopping	active	\N	\N	\N	f	0	2026-04-06 14:39:33.960455+00	2026-04-06 14:39:33.960455+00	f
72	How would you rate your most-used food delivery app?	Think about Uber Eats, DoorDash, Grubhub, or a local equivalent.	rating	Food & Dining	active	\N	\N	\N	f	0	2026-04-06 14:39:33.960455+00	2026-04-06 14:39:33.960455+00	f
73	Rate your local supermarket or grocery store	Product variety, pricing, freshness, and customer experience.	rating	Shopping	active	\N	\N	\N	f	0	2026-04-06 14:39:33.960455+00	2026-04-06 14:39:33.960455+00	f
74	How many hours of sleep do you get on a typical night?	Be honest — what's your usual night's sleep?	poll	Healthcare	active	{"Less than 5 hours","5–6 hours","7–8 hours","More than 8 hours"}	\N	\N	f	0	2026-04-06 14:39:33.960455+00	2026-04-06 14:39:33.960455+00	f
75	Do you exercise regularly?	How often do you do intentional physical exercise?	poll	Healthcare	active	{Daily,"3–5 times a week","1–2 times a week",Rarely,Never}	\N	\N	f	0	2026-04-06 14:39:33.960455+00	2026-04-06 14:39:33.960455+00	f
76	What is your primary mode of daily transportation?	How do you usually get around on a typical day?	poll	Transportation	active	{"Personal car","Public transit (bus/metro)","Walk / Bicycle","Ride-hailing (Uber/Lyft)",Motorbike/Scooter,"Work from home"}	\N	\N	f	0	2026-04-06 14:39:33.960455+00	2026-04-06 14:39:33.960455+00	f
77	How do you prefer to spend your weekends?	What does a typical weekend look like for you?	poll	Lifestyle	active	{"Socializing with friends/family","Relaxing at home","Outdoor activities","Catching up on work","Exploring hobbies","Mix of everything"}	\N	\N	f	0	2026-04-06 14:39:33.960455+00	2026-04-06 14:39:33.960455+00	f
78	What type of music do you listen to most?	Pick the genre that best describes your everyday listening.	poll	Entertainment	active	{Pop,"Hip-hop / R&B","Rock / Alternative","Electronic / Dance","Classical / Jazz","Afrobeats / World",Country,Other}	\N	\N	f	0	2026-04-06 14:39:33.960455+00	2026-04-06 14:39:33.960455+00	f
79	What is one thing you wish you could improve about your daily routine?	Any aspect — health, productivity, relationships, habits, etc.	short_answer	Lifestyle	active	\N	\N	\N	f	0	2026-04-06 14:39:33.960455+00	2026-04-06 14:39:33.960455+00	f
80	Describe your ideal holiday destination in a few words	Beach, mountains, city break, rural retreat — paint us a picture!	short_answer	Preferences	active	\N	\N	\N	f	0	2026-04-06 14:39:33.960455+00	2026-04-06 14:39:33.960455+00	f
81	What skill do you most wish you had learned earlier in life?	Could be professional, creative, practical — anything goes.	short_answer	Preferences	active	\N	\N	\N	f	0	2026-04-06 14:39:33.960455+00	2026-04-06 14:39:33.960455+00	f
82	How would you rate Spotify as a music streaming service?	Music catalog, discovery features, app quality, and pricing.	rating	Entertainment	active	\N	\N	\N	f	0	2026-04-06 14:39:33.960455+00	2026-04-06 14:39:33.960455+00	f
83	Rate your experience with online banking / your bank's app	Ease of use, features, reliability, and customer support.	rating	Finance	active	\N	\N	\N	f	0	2026-04-06 14:39:33.960455+00	2026-04-06 14:39:33.960455+00	f
84	How would you rate your country's public healthcare system?	Accessibility, quality of care, wait times, and affordability.	rating	Healthcare	active	\N	\N	\N	f	0	2026-04-06 14:39:33.960455+00	2026-04-06 14:39:33.960455+00	f
85	Rate your most-used search engine (Google, Bing, etc.)	Speed, accuracy, privacy, and overall quality of results.	rating	Technology	active	\N	\N	\N	f	0	2026-04-06 14:39:33.960455+00	2026-04-06 14:39:33.960455+00	f
99	Dog person or cat person?	\N	poll	Personal	active	{Dog,Cat,"Both equally",Neither}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
100	Mountains or beaches?	\N	poll	Personal	active	{Mountains,Beaches,"Both equally"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
101	How do you prefer to receive news?	\N	poll	Personal	active	{"Social media","News apps",TV,Newspapers/Podcasts}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
102	What's your most productive time of day?	\N	poll	Personal	active	{"Early morning","Late morning",Afternoon,Evening,"Late night"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
103	Do you prefer bold flavors or mild ones?	\N	poll	Personal	active	{"Bold and spicy","Mild and subtle","Depends on my mood"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
104	Rate how much you enjoy cooking	\N	rating	Personal	active	\N	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
105	What's your ideal weekend plan?	\N	poll	Personal	active	{"Sleep in and relax","Explore somewhere new","Spend time with friends","Work on a personal project"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
106	How many hours of sleep do you usually get?	\N	poll	Lifestyle	active	{"Less than 6 hours","6–7 hours","7–8 hours","8–9 hours","9+ hours"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
107	How often do you exercise?	\N	poll	Lifestyle	active	{Daily,"A few times a week",Occasionally,"Rarely or never"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
108	How do you start your mornings?	\N	poll	Lifestyle	active	{"Check my phone","Work out","Meditate or journal","Eat breakfast first","Just get up and go"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
109	Do you work better from home or the office?	\N	poll	Lifestyle	active	{Home,Office,"A café or co-working space","I mix it up"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
110	How often do you meal prep for the week?	\N	poll	Lifestyle	active	{"Every week",Sometimes,Rarely,Never}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
111	Are you more of an introvert or extrovert?	\N	poll	Lifestyle	active	{Introvert,Extrovert,"Ambivert — depends on the day"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
112	How important is a daily routine to you?	\N	rating	Lifestyle	active	\N	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
113	How often do you take breaks during work?	\N	poll	Lifestyle	active	{"Every 30 minutes","Every hour","Every couple of hours",Rarely}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
45	Which city or town do you currently live in?	Tell us your city so we can surface location-based insights.	short_answer	Profile	active	\N	\N	\N	f	0	2026-04-06 14:39:33.960455+00	2026-04-06 14:39:33.960455+00	f
46	What is your current occupation or job title?	Describe your role in a few words (e.g. Software Engineer, Teacher, Student).	short_answer	Profile	active	\N	\N	\N	f	0	2026-04-06 14:39:33.960455+00	2026-04-06 14:39:33.960455+00	f
47	What is your highest level of education?	Select the highest academic level you have completed or are currently pursuing.	poll	Profile	active	{"High School","Some College","Bachelor's Degree","Master's Degree","PhD / Doctorate","Vocational / Trade","Prefer not to say"}	\N	\N	f	0	2026-04-06 14:39:33.960455+00	2026-04-06 14:39:33.960455+00	f
48	What best describes your current employment status?	Help us understand your working situation.	poll	Profile	active	{"Employed full-time","Employed part-time","Self-employed / Freelance",Student,Unemployed,Retired}	\N	\N	f	0	2026-04-06 14:39:33.960455+00	2026-04-06 14:39:33.960455+00	f
49	What is your all-time favorite movie or TV show?	Don't overthink it — just the one that comes to mind first.	short_answer	Preferences	active	\N	\N	\N	f	0	2026-04-06 14:39:33.960455+00	2026-04-06 14:39:33.960455+00	f
50	What's your favorite type of food or cuisine?	Italian, Japanese, Mexican, local street food — anything goes!	short_answer	Preferences	active	\N	\N	\N	f	0	2026-04-06 14:39:33.960455+00	2026-04-06 14:39:33.960455+00	f
51	Which app do you use the most every day?	Think about the app you'd be lost without.	short_answer	Preferences	active	\N	\N	\N	f	0	2026-04-06 14:39:33.960455+00	2026-04-06 14:39:33.960455+00	f
52	Which smartphone brand do you prefer?	If you had to pick just one brand for your next phone, which would it be?	poll	Preferences	active	{"Apple (iPhone)",Samsung,Xiaomi,"Google Pixel",Huawei,OnePlus,Other}	\N	\N	f	0	2026-04-06 14:39:33.960455+00	2026-04-06 14:39:33.960455+00	f
53	What is your favorite sport to watch or play?	Name the sport you're most passionate about.	short_answer	Preferences	active	\N	\N	\N	f	0	2026-04-06 14:39:33.960455+00	2026-04-06 14:39:33.960455+00	f
54	What's your go-to daily drink?	The beverage you reach for most often throughout the day.	poll	Preferences	active	{Coffee,Tea,Water,Juice,"Soda / Fizzy drink","Energy drink",Milk}	\N	\N	f	0	2026-04-06 14:39:33.960455+00	2026-04-06 14:39:33.960455+00	f
55	Tea or Coffee — which do you prefer?	The eternal debate. Which side are you on?	poll	Lifestyle	active	{"Tea ☕","Coffee ☕","Both equally",Neither}	\N	\N	f	0	2026-04-06 14:39:33.960455+00	2026-04-06 14:39:33.960455+00	f
56	Do you prefer online shopping or in-store shopping?	When you need to buy something, what's your default approach?	poll	Shopping	active	{"Always online","Always in-store","Depends on what I'm buying","About 50/50"}	\N	\N	f	0	2026-04-06 14:39:33.960455+00	2026-04-06 14:39:33.960455+00	f
57	Work from home or office — which do you prefer?	If you had complete freedom to choose, where would you rather work?	poll	Lifestyle	active	{"Full remote (home)","Full office","Hybrid (mix of both)","I'm a student / not applicable"}	\N	\N	f	0	2026-04-06 14:39:33.960455+00	2026-04-06 14:39:33.960455+00	f
58	Are you a morning person or a night owl?	When do you feel most productive and energized?	poll	Lifestyle	active	{"Morning person 🌅","Night owl 🦉","Somewhere in between","Depends on the day"}	\N	\N	f	0	2026-04-06 14:39:33.960455+00	2026-04-06 14:39:33.960455+00	f
59	Android or iPhone — which team are you on?	When it comes to smartphones, there are two camps. Which is yours?	poll	Technology	active	{"Android 🤖","iPhone 🍎","I switch between both","Neither / Other"}	\N	\N	f	0	2026-04-06 14:39:33.960455+00	2026-04-06 14:39:33.960455+00	f
60	Pepsi or Coca-Cola — which do you choose?	Given a free can at a restaurant, which would you reach for?	poll	Food & Dining	active	{Pepsi,Coca-Cola,"I'd drink either","Neither — I don't drink soda"}	\N	\N	f	0	2026-04-06 14:39:33.960455+00	2026-04-06 14:39:33.960455+00	f
61	Which social media platform do you enjoy most?	The one you'd keep if you could only use a single platform.	poll	Technology	active	{Instagram,TikTok,YouTube,"X (Twitter)",Facebook,LinkedIn,Snapchat,Other}	\N	\N	f	0	2026-04-06 14:39:33.960455+00	2026-04-06 14:39:33.960455+00	f
62	Cat person or dog person?	If you had to pick just one as a pet, which would you choose?	poll	Lifestyle	active	{"Cat 🐱","Dog 🐶",Both!,"Neither — I prefer no pets"}	\N	\N	f	0	2026-04-06 14:39:33.960455+00	2026-04-06 14:39:33.960455+00	f
63	Do you prefer reading books or watching movies/shows?	When you want to relax, which do you reach for first?	poll	Lifestyle	active	{"Books 📚","Movies / Shows 🎬","Both equally",Neither}	\N	\N	f	0	2026-04-06 14:39:33.960455+00	2026-04-06 14:39:33.960455+00	f
64	How would you rate Colgate toothpaste?	Rate based on taste, whitening effectiveness, and overall satisfaction.	rating	Healthcare	active	\N	\N	\N	f	0	2026-04-06 14:39:33.960455+00	2026-04-06 14:39:33.960455+00	f
65	Rate your KFC experience — food, service, and value	Based on your most recent or typical visit to KFC.	rating	Food & Dining	active	\N	\N	\N	f	0	2026-04-06 14:39:33.960455+00	2026-04-06 14:39:33.960455+00	f
86	What's your favorite season?	\N	poll	Personal	active	{Spring,Summer,Autumn,Winter}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
87	Coffee or tea — which do you prefer?	\N	poll	Personal	active	{Coffee,Tea,Neither,"Both equally"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
88	What type of music do you enjoy most?	\N	poll	Personal	active	{Pop,Rock,Hip-Hop,Classical,Electronic}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
89	Watching movies at home or at the cinema?	\N	poll	Personal	active	{"At home",Cinema,"Equally love both"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
90	Sweet or savory — which side are you on?	\N	poll	Personal	active	{Sweet,Savory,"Both equally"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
91	Books or TV shows — how do you prefer stories?	\N	poll	Personal	active	{Books,"TV shows","Both equally",Neither}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
92	How do you prefer to spend your weekends?	\N	poll	Personal	active	{"Relaxing at home","Going out","Mix of both"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
93	What's your dream vacation type?	\N	poll	Personal	active	{Beach,Mountains,"City break",Countryside}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
94	Morning person or night owl?	\N	poll	Personal	active	{"Morning person","Night owl","Somewhere in between"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
95	Favorite movie genre?	\N	poll	Personal	active	{Action,Comedy,Drama,Sci-Fi,Horror,Romance}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
96	How do you prefer to socialize?	\N	poll	Personal	active	{"Large groups","Small groups",One-on-one,"I mostly keep to myself"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
97	Cook at home or eat out?	\N	poll	Personal	active	{"Cook at home","Eat out","Mix of both"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
98	Rate your love for traveling	\N	rating	Personal	active	\N	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
114	Do you prefer a tidy or lived-in home?	\N	poll	Lifestyle	active	{"Very tidy — everything in its place","Organized chaos","Comfortably lived-in"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
115	How do you usually handle stress?	\N	poll	Lifestyle	active	{Exercise,"Talk to someone","Distract myself","Rest and sleep","Push through it"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
116	Shopping online or in-store?	\N	poll	Lifestyle	active	{"Online always","In-store always","Both — depends on what it is"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
117	How much water do you drink daily?	\N	poll	Lifestyle	active	{"Less than 1 litre","1–2 litres","2–3 litres","3+ litres"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
118	Rate your overall health and wellbeing right now	\N	rating	Lifestyle	active	\N	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
119	Do you prefer silence or background noise while working?	\N	poll	Lifestyle	active	{"Total silence",Music,"White noise or rain sounds","TV or podcast in background"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
120	How do you unwind at the end of the day?	\N	poll	Lifestyle	active	{"Watch something",Read,Gaming,Socialise,Exercise,"Just sleep"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
121	Rate how satisfied you are with your work-life balance	\N	rating	Lifestyle	active	\N	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
122	Do you follow a morning skincare routine?	\N	poll	Lifestyle	active	{"Yes, always",Sometimes,"No, I keep it simple"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
123	How many vacations do you take per year?	\N	poll	Lifestyle	active	{None,1–2,3–5,"More than 5"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
124	How important is having clear goals in life to you?	\N	rating	Lifestyle	active	\N	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
125	Do you prefer spontaneous plans or scheduling ahead?	\N	poll	Lifestyle	active	{"Plan everything in advance","Mostly plan but stay flexible","Mostly spontaneous","Total spontaneity always"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
126	What's your primary smartphone brand?	\N	poll	Technology	active	{"Apple (iPhone)",Samsung,"Google (Pixel)",OnePlus,Other}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
127	Do you use AI tools in your daily life?	\N	poll	Technology	active	{"Yes, regularly",Sometimes,Rarely,"No, not yet"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
128	How many hours a day do you spend on your phone?	\N	poll	Technology	active	{"Less than 2 hours","2–4 hours","4–6 hours","More than 6 hours"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
129	Do you think AI will mostly help or harm humanity?	\N	poll	Technology	active	{"Mostly help","Mostly harm","Both equally","Too early to tell"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
130	Your most-used social media platform?	\N	poll	Technology	active	{Instagram,TikTok,Twitter/X,YouTube,LinkedIn,Facebook}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
131	Dark mode or light mode?	\N	poll	Technology	active	{"Dark mode always","Light mode always","Depends on the time of day"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
132	How important is fast internet to your daily life?	\N	rating	Technology	active	\N	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
133	Do you own a smart home device?	\N	poll	Technology	active	{"Yes, and I love it","Yes, but I barely use it","No, but I want one","No, not interested"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
134	What do you mainly use your laptop or PC for?	\N	poll	Technology	active	{Work,Gaming,"Creative projects","Browsing and streaming","All of the above"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
135	How often do you update your apps?	\N	poll	Technology	active	{"As soon as updates drop",Occasionally,"Only when forced",Rarely}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
136	Do you back up your data regularly?	\N	poll	Technology	active	{"Yes, always",Sometimes,"No, I should probably start"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
137	Rate your overall tech-savviness	\N	rating	Technology	active	\N	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
138	Apps or websites — which do you prefer for services?	\N	poll	Technology	active	{"Apps all the way","Websites — no clutter","No preference"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
139	How concerned are you about your online privacy?	\N	rating	Technology	active	\N	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
140	Does social media have more positive or negative impact?	\N	poll	Technology	active	{"Mostly positive","Mostly negative","Both — depends on how you use it"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
141	What type of content do you consume most online?	\N	poll	Technology	active	{"Short videos (Reels/TikTok)","Long-form YouTube","Articles and blogs",Podcasts,"All of these"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
142	E-books or physical books?	\N	poll	Technology	active	{E-books,"Physical books","Both equally","I don't really read books"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
143	How often do you video call with friends or family?	\N	poll	Technology	active	{Daily,"A few times a week",Monthly,Rarely}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
144	Do you use a VPN?	\N	poll	Technology	active	{"Yes, always",Sometimes,No}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
145	Rate the overall impact of technology on your quality of life	\N	rating	Technology	active	\N	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
146	Is remote work more productive than office work?	\N	poll	Social	active	{"Yes, definitely","No, the office is better","It depends on the person","Not sure"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
147	How important is having a large social circle to you?	\N	rating	Social	active	\N	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
148	Are social media influencers good role models?	\N	poll	Social	active	{Yes,No,"Some of them are","It completely depends"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
149	How comfortable are you speaking in front of a crowd?	\N	rating	Social	active	\N	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
150	Kindness or honesty — which matters more?	\N	poll	Social	active	{Kindness,Honesty,"Both equally","It really depends"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
151	Do you believe in giving people second chances?	\N	poll	Social	active	{"Yes, always","Usually yes","Only once",Rarely}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
152	Can money buy happiness?	\N	poll	Social	active	{"Yes, to a degree","No, never","It solves most problems","It's complicated"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
153	How important is sustainability in your daily choices?	\N	rating	Social	active	\N	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
154	Do you prefer to lead or follow in a team?	\N	poll	Social	active	{"I prefer to lead","I prefer to follow","It depends on the situation"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
155	Is success mostly about hard work or luck?	\N	poll	Social	active	{"Mostly hard work","Mostly luck","Both equally","Something else entirely"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
156	Rate how open-minded you consider yourself	\N	rating	Social	active	\N	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
157	Do you think failure is an important part of success?	\N	poll	Social	active	{"Yes, absolutely","Not necessarily","It can be, it depends"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
158	How important is recognition from others to your motivation?	\N	rating	Social	active	\N	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
159	Do you prefer direct or gentle feedback?	\N	poll	Social	active	{"Direct — just tell me","Gentle — soften it a bit","Depends on the situation"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
160	Do you think most people are fundamentally good?	\N	poll	Social	active	{"Yes, I do","No, I don't","It depends on circumstances",Unsure}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
161	Rate your confidence in social situations	\N	rating	Social	active	\N	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
162	Is it important to follow traditions?	\N	poll	Social	active	{"Yes, always","Some traditions yes","Not particularly","No, traditions hold us back"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
163	How often do you volunteer or give back to your community?	\N	poll	Social	active	{Regularly,Occasionally,Rarely,Never}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
164	Is it more important to be liked or respected?	\N	poll	Social	active	{Liked,Respected,"Both equally","Neither matters to me"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
165	Rate how much you enjoy meeting new people	\N	rating	Social	active	\N	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
166	Superpower: fly or be invisible?	\N	poll	Fun	active	{Fly,"Be invisible"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
167	What's your go-to karaoke genre?	\N	poll	Fun	active	{"Pop hits","Rock classics","R&B / Soul","I don't do karaoke"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
168	Do you believe in luck?	\N	poll	Fun	active	{"Yes, definitely",Somewhat,"No, not really"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
169	Rate how adventurous you are with trying new food	\N	rating	Fun	active	\N	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
170	Too hot or too cold — which is worse?	\N	poll	Fun	active	{"Too hot","Too cold"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
171	What's the first thing you'd do with $1 million?	\N	poll	Fun	active	{"Travel the world","Invest it","Buy a house","Give to charity","Pay off debts"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
172	Do you believe there's life on other planets?	\N	poll	Fun	active	{"Yes, definitely",Probably,"Probably not","Definitely not"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
173	Famous or extremely wealthy — which would you choose?	\N	poll	Fun	active	{Famous,"Extremely wealthy",Neither,"Both, please"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
174	Rate how much you enjoy unexpected surprises	\N	rating	Fun	active	\N	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
175	Time travel: the past or the future?	\N	poll	Fun	active	{"The past","The future","Neither — I like the present"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
176	Rate how competitive you are in general	\N	rating	Fun	active	\N	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
177	Texting or calling — which do you prefer?	\N	poll	Fun	active	{"Texting always","Calling always","Video calls","Depends on who it is"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
178	If you could master one skill instantly, what would it be?	\N	poll	Fun	active	{"A new language","A musical instrument","Cooking like a chef",Coding,"A sport"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
179	More money or more free time?	\N	poll	Fun	active	{"More money","More free time","An equal balance of both"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
180	Rate how happy you are with your life right now	\N	rating	Fun	active	\N	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
181	Would you rather live in a city or the countryside?	\N	poll	Fun	active	{City,Countryside,Suburbs,"Doesn't matter as long as I'm happy"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
182	Do you believe dreams have hidden meanings?	\N	poll	Fun	active	{"Yes, always",Sometimes,"No, they're just random","I rarely dream"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
183	Solve it yourself or ask for help straight away?	\N	poll	Fun	active	{"Try to solve it myself first","Ask for help straight away","Depends on how urgent it is"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
184	Rate how much of a risk-taker you are	\N	rating	Fun	active	\N	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
185	If you could live anywhere in the world, where would you go?	\N	poll	Fun	active	{Europe,"Southeast Asia","North America","Australia / NZ","Stay where I am"}	\N	\N	f	0	2026-04-07 06:24:24.418595+00	2026-04-07 06:24:24.418595+00	f
\.


--
-- Data for Name: referral_clicks; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.referral_clicks (id, referral_code, referrer_user_id, ip_address, user_agent, session_id, created_at) FROM stdin;
\.


--
-- Data for Name: referrals; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.referrals (id, referrer_user_id, referred_user_id, referral_code_used, signup_bonus_cents, answer_bonus_cents_total, signup_bonus_granted_at, referrer_click_ip, referred_signup_ip, referred_user_agent, status, fraud_flags, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: transactions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.transactions (id, user_id, type, amount_cents, description, status, related_id, created_at) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, clerk_id, email, name, city, age_group, gender, is_admin, created_at, updated_at, name_rewarded, city_rewarded, age_group_rewarded, gender_rewarded, referral_code, referred_by_user_id, signup_ip, user_agent) FROM stdin;
4	user_3BtEg4t5PH06yyWrI772Vw5L68T	shahidlogs@gmail.com	shahid khan	\N	\N	\N	f	2026-04-06 14:38:28.440221+00	2026-04-09 05:44:31.099+00	f	f	f	f	CUOBSGXX	\N	\N	\N
\.


--
-- Data for Name: wallets; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.wallets (id, user_id, balance_cents, total_earned_cents, total_withdrawn_cents, created_at, updated_at) FROM stdin;
17	user_3BtEg4t5PH06yyWrI772Vw5L68T	0	0	0	2026-04-06 14:38:28.194385+00	2026-04-06 14:38:28.194385+00
\.


--
-- Name: answers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.answers_id_seq', 15, true);


--
-- Name: notifications_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.notifications_id_seq', 1, false);


--
-- Name: question_milestones_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.question_milestones_id_seq', 1, false);


--
-- Name: questions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.questions_id_seq', 185, true);


--
-- Name: referral_clicks_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.referral_clicks_id_seq', 1, false);


--
-- Name: referrals_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.referrals_id_seq', 1, false);


--
-- Name: transactions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.transactions_id_seq', 2, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.users_id_seq', 4, true);


--
-- Name: wallets_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.wallets_id_seq', 3723, true);


--
-- Name: answers answers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.answers
    ADD CONSTRAINT answers_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: question_milestones question_milestones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_milestones
    ADD CONSTRAINT question_milestones_pkey PRIMARY KEY (id);


--
-- Name: question_milestones question_milestones_question_milestone_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_milestones
    ADD CONSTRAINT question_milestones_question_milestone_unique UNIQUE (question_id, milestone);


--
-- Name: questions questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_pkey PRIMARY KEY (id);


--
-- Name: referral_clicks referral_clicks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_clicks
    ADD CONSTRAINT referral_clicks_pkey PRIMARY KEY (id);


--
-- Name: referrals referrals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_pkey PRIMARY KEY (id);


--
-- Name: referrals referrals_referred_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_referred_user_id_key UNIQUE (referred_user_id);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: users users_clerk_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_clerk_id_unique UNIQUE (clerk_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_referral_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_referral_code_key UNIQUE (referral_code);


--
-- Name: wallets wallets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_pkey PRIMARY KEY (id);


--
-- Name: wallets wallets_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_user_id_unique UNIQUE (user_id);


--
-- PostgreSQL database dump complete
--

\unrestrict XtmNYpiAzqZU0gmLknWfqqXt0x1vAKpMi4B28hvxMbZT17dIkAjNVSZudxrJkeR

