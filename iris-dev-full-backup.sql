--
-- PostgreSQL database dump
--

\restrict Cl8VaMMehanvnvJ2D7J0cXwTN0GKeeS0UFLGmapYGkdgUjxnb8e5iDuhJF95uVv

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
-- Name: iris_document_audit; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.iris_document_audit (
    id bigint NOT NULL,
    document_id bigint,
    actor_key_id text NOT NULL,
    action text NOT NULL,
    details jsonb,
    client_ip inet,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT iris_document_audit_action_check CHECK ((action = ANY (ARRAY['document_created'::text, 'document_reviewed'::text, 'document_activated'::text, 'document_rejected'::text, 'document_retired'::text, 'document_replaced'::text]))),
    CONSTRAINT iris_document_audit_actor_not_blank CHECK ((length(TRIM(BOTH FROM actor_key_id)) > 0))
);


ALTER TABLE public.iris_document_audit OWNER TO postgres;

--
-- Name: iris_document_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.iris_document_audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.iris_document_audit_id_seq OWNER TO postgres;

--
-- Name: iris_document_audit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.iris_document_audit_id_seq OWNED BY public.iris_document_audit.id;


--
-- Name: iris_document_chunks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.iris_document_chunks (
    id bigint NOT NULL,
    document_id bigint NOT NULL,
    chunk_index integer NOT NULL,
    heading text,
    content text NOT NULL,
    content_sha256 text NOT NULL,
    search_text_normalized text NOT NULL,
    character_start integer NOT NULL,
    character_end integer NOT NULL,
    search_vector tsvector GENERATED ALWAYS AS ((setweight(to_tsvector('simple'::regconfig, COALESCE(heading, ''::text)), 'A'::"char") || setweight(to_tsvector('simple'::regconfig, search_text_normalized), 'B'::"char"))) STORED,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT iris_document_chunks_content_length_check CHECK (((char_length(content) >= 1) AND (char_length(content) <= 2000))),
    CONSTRAINT iris_document_chunks_hash_check CHECK ((content_sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT iris_document_chunks_index_check CHECK ((chunk_index >= 0)),
    CONSTRAINT iris_document_chunks_positions_check CHECK (((character_start >= 0) AND (character_end > character_start))),
    CONSTRAINT iris_document_chunks_search_text_check CHECK ((length(TRIM(BOTH FROM search_text_normalized)) > 0))
);


ALTER TABLE public.iris_document_chunks OWNER TO postgres;

--
-- Name: iris_document_chunks_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.iris_document_chunks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.iris_document_chunks_id_seq OWNER TO postgres;

--
-- Name: iris_document_chunks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.iris_document_chunks_id_seq OWNED BY public.iris_document_chunks.id;


--
-- Name: iris_documents; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.iris_documents (
    id bigint NOT NULL,
    document_key text NOT NULL,
    document_family_key text NOT NULL,
    title text NOT NULL,
    source_name text NOT NULL,
    source_reference text NOT NULL,
    rights_holder text NOT NULL,
    authorization_status text DEFAULT 'pending'::text NOT NULL,
    authorization_reference text,
    language text NOT NULL,
    country text DEFAULT 'GLOBAL'::text NOT NULL,
    category text NOT NULL,
    product_slug text,
    version_label text,
    effective_from timestamp with time zone,
    effective_until timestamp with time zone,
    object_key text NOT NULL,
    mime_type text NOT NULL,
    content_sha256 text NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    retired_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT iris_documents_activation_check CHECK (((is_active = false) OR ((authorization_status = 'approved'::text) AND (length(TRIM(BOTH FROM COALESCE(authorization_reference, ''::text))) > 0) AND (retired_at IS NULL)))),
    CONSTRAINT iris_documents_authorization_status_check CHECK ((authorization_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))),
    CONSTRAINT iris_documents_category_not_blank CHECK ((length(TRIM(BOTH FROM category)) > 0)),
    CONSTRAINT iris_documents_content_sha256_check CHECK ((content_sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT iris_documents_country_check CHECK (((country = 'GLOBAL'::text) OR (country ~ '^[A-Z]{2}$'::text))),
    CONSTRAINT iris_documents_document_key_not_blank CHECK ((length(TRIM(BOTH FROM document_key)) > 0)),
    CONSTRAINT iris_documents_effective_dates_check CHECK (((effective_from IS NULL) OR (effective_until IS NULL) OR (effective_until > effective_from))),
    CONSTRAINT iris_documents_family_key_not_blank CHECK ((length(TRIM(BOTH FROM document_family_key)) > 0)),
    CONSTRAINT iris_documents_language_check CHECK ((language ~ '^[a-z]{2}(-[A-Z]{2})?$'::text)),
    CONSTRAINT iris_documents_mime_type_check CHECK ((mime_type = 'application/pdf'::text)),
    CONSTRAINT iris_documents_object_key_not_blank CHECK ((length(TRIM(BOTH FROM object_key)) > 0)),
    CONSTRAINT iris_documents_retired_inactive_check CHECK (((retired_at IS NULL) OR (is_active = false))),
    CONSTRAINT iris_documents_rights_holder_not_blank CHECK ((length(TRIM(BOTH FROM rights_holder)) > 0)),
    CONSTRAINT iris_documents_source_name_not_blank CHECK ((length(TRIM(BOTH FROM source_name)) > 0)),
    CONSTRAINT iris_documents_source_reference_not_blank CHECK ((length(TRIM(BOTH FROM source_reference)) > 0)),
    CONSTRAINT iris_documents_title_not_blank CHECK ((length(TRIM(BOTH FROM title)) > 0))
);


ALTER TABLE public.iris_documents OWNER TO postgres;

--
-- Name: iris_documents_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.iris_documents_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.iris_documents_id_seq OWNER TO postgres;

--
-- Name: iris_documents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.iris_documents_id_seq OWNED BY public.iris_documents.id;


--
-- Name: iris_search_aliases; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.iris_search_aliases (
    id bigint NOT NULL,
    alias_normalized text NOT NULL,
    canonical_term text NOT NULL,
    product_slug text NOT NULL,
    language text,
    country text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT iris_search_aliases_alias_not_blank CHECK ((length(TRIM(BOTH FROM alias_normalized)) > 0)),
    CONSTRAINT iris_search_aliases_canonical_not_blank CHECK ((length(TRIM(BOTH FROM canonical_term)) > 0)),
    CONSTRAINT iris_search_aliases_country_check CHECK (((country IS NULL) OR (country = 'GLOBAL'::text) OR (country ~ '^[A-Z]{2}$'::text))),
    CONSTRAINT iris_search_aliases_language_check CHECK (((language IS NULL) OR (language ~ '^[a-z]{2}(-[A-Z]{2})?$'::text))),
    CONSTRAINT iris_search_aliases_product_not_blank CHECK ((length(TRIM(BOTH FROM product_slug)) > 0))
);


ALTER TABLE public.iris_search_aliases OWNER TO postgres;

--
-- Name: iris_search_aliases_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.iris_search_aliases_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.iris_search_aliases_id_seq OWNER TO postgres;

--
-- Name: iris_search_aliases_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.iris_search_aliases_id_seq OWNED BY public.iris_search_aliases.id;


--
-- Name: iris_document_audit id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.iris_document_audit ALTER COLUMN id SET DEFAULT nextval('public.iris_document_audit_id_seq'::regclass);


--
-- Name: iris_document_chunks id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.iris_document_chunks ALTER COLUMN id SET DEFAULT nextval('public.iris_document_chunks_id_seq'::regclass);


--
-- Name: iris_documents id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.iris_documents ALTER COLUMN id SET DEFAULT nextval('public.iris_documents_id_seq'::regclass);


--
-- Name: iris_search_aliases id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.iris_search_aliases ALTER COLUMN id SET DEFAULT nextval('public.iris_search_aliases_id_seq'::regclass);


--
-- Data for Name: iris_document_audit; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.iris_document_audit (id, document_id, actor_key_id, action, details, client_ip, created_at) FROM stdin;
1	1	nuapp-iris-admin-v1	document_created	{"country": "US", "category": "marketing-product", "language": "es", "chunkCount": 1, "productSlug": "collagen-plus"}	\N	2026-08-18 17:27:06.245155+00
2	1	nachoa84	document_reviewed	{"decision": "reviewed"}	\N	2026-08-19 18:14:57.289535+00
3	1	nachoa84	document_reviewed	{"decision": "approved"}	\N	2026-08-19 18:21:07.255599+00
4	1	nachoa84	document_activated	{}	\N	2026-08-19 18:22:56.666631+00
\.


--
-- Data for Name: iris_document_chunks; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.iris_document_chunks (id, document_id, chunk_index, heading, content, content_sha256, search_text_normalized, character_start, character_end, created_at) FROM stdin;
1	1	0	\N	86990398\n\nTe compartimos algunas ideas:\n1. Cuando recibas tu kit, graba un\nunboxing video y súbelo a tus\nredes sociales etiquetando\nnuestra cuenta @nuskinlatam\n2. Cuenta tu emoción de ser de los\nprimeros en tener el producto en\ntu país lQué cosas puedes decir de Collagen+?\n- Aumenta la producción de colágeno y\nelastina en la piel\n- Ayuda a mejorar la luminosidad de la piel\n- Ayuda a proteger la piel contra la luz azul\n- Favorece la hidratación y los niveles de\nhumectación\n- Ayuda a reducir visiblemente las líneas\nde expresión y las arrugas\n"'Declaraciones aprobadas solo\npara Estados Unidos\n3. Úsalo por un mes o más y documenta\ntu proceso con fotos cada semana o 2\nsemanas (recuerda seguir los\nlineamientos para fotos de antes y\ndespués). Sube tu contenido en la\npágina de Collagen+ de tu mercado.\n4. Utiliza esta etiqueta cuando hagas\npublicaciones en redes sociales:\n#Collagen+LATAM	1252f5a42fae5434ab62e940b851e70859385c9e77e30a7f7f950ff0169c8f4f	86990398 te compartimos algunas ideas: 1. cuando recibas tu kit, graba un unboxing video y subelo a tus redes sociales etiquetando nuestra cuenta @nuskinlatam 2. cuenta tu emocion de ser de los primeros en tener el producto en tu pais lque cosas puedes decir de collagen+? - aumenta la produccion de colageno y elastina en la piel - ayuda a mejorar la luminosidad de la piel - ayuda a proteger la piel contra la luz azul - favorece la hidratacion y los niveles de humectacion - ayuda a reducir visiblemente las lineas de expresion y las arrugas "'declaraciones aprobadas solo para estados unidos 3. usalo por un mes o mas y documenta tu proceso con fotos cada semana o 2 semanas (recuerda seguir los lineamientos para fotos de antes y despues). sube tu contenido en la pagina de collagen+ de tu mercado. 4. utiliza esta etiqueta cuando hagas publicaciones en redes sociales: #collagen+latam	0	891	2026-08-18 17:27:06.245155+00
\.


--
-- Data for Name: iris_documents; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.iris_documents (id, document_key, document_family_key, title, source_name, source_reference, rights_holder, authorization_status, authorization_reference, language, country, category, product_slug, version_label, effective_from, effective_until, object_key, mime_type, content_sha256, is_active, retired_at, created_at, updated_at) FROM stdin;
1	doc_00207bc8-ea01-458f-9116-f137b1e6a92f	family_80b8325b-c0a8-4a81-9e37-2b66d9419366	Collagen Plus	Material Collagen	collagen-pdf-v1	Nutrilite	approved	provided-by-nuapp-owner-2026-08-18	es	US	marketing-product	collagen-plus	v1	\N	\N	iris/documents/v1/family_80b8325b-c0a8-4a81-9e37-2b66d9419366/doc_00207bc8-ea01-458f-9116-f137b1e6a92f/90f0a6f0b841e803a21ff565da381edf44785f2a25dbe6965f7aa7adb46a5dc3/original.pdf	application/pdf	90f0a6f0b841e803a21ff565da381edf44785f2a25dbe6965f7aa7adb46a5dc3	t	\N	2026-08-18 17:27:06.245155+00	2026-08-19 18:22:56.634+00
\.


--
-- Data for Name: iris_search_aliases; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.iris_search_aliases (id, alias_normalized, canonical_term, product_slug, language, country, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Name: iris_document_audit_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.iris_document_audit_id_seq', 4, true);


--
-- Name: iris_document_chunks_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.iris_document_chunks_id_seq', 9, true);


--
-- Name: iris_documents_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.iris_documents_id_seq', 10, true);


--
-- Name: iris_search_aliases_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.iris_search_aliases_id_seq', 1, false);


--
-- Name: iris_document_audit iris_document_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.iris_document_audit
    ADD CONSTRAINT iris_document_audit_pkey PRIMARY KEY (id);


--
-- Name: iris_document_chunks iris_document_chunks_document_index_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.iris_document_chunks
    ADD CONSTRAINT iris_document_chunks_document_index_unique UNIQUE (document_id, chunk_index);


--
-- Name: iris_document_chunks iris_document_chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.iris_document_chunks
    ADD CONSTRAINT iris_document_chunks_pkey PRIMARY KEY (id);


--
-- Name: iris_documents iris_documents_content_sha256_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.iris_documents
    ADD CONSTRAINT iris_documents_content_sha256_unique UNIQUE (content_sha256);


--
-- Name: iris_documents iris_documents_document_key_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.iris_documents
    ADD CONSTRAINT iris_documents_document_key_unique UNIQUE (document_key);


--
-- Name: iris_documents iris_documents_object_key_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.iris_documents
    ADD CONSTRAINT iris_documents_object_key_unique UNIQUE (object_key);


--
-- Name: iris_documents iris_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.iris_documents
    ADD CONSTRAINT iris_documents_pkey PRIMARY KEY (id);


--
-- Name: iris_search_aliases iris_search_aliases_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.iris_search_aliases
    ADD CONSTRAINT iris_search_aliases_pkey PRIMARY KEY (id);


--
-- Name: idx_iris_document_audit_action; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_iris_document_audit_action ON public.iris_document_audit USING btree (action);


--
-- Name: idx_iris_document_audit_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_iris_document_audit_created ON public.iris_document_audit USING btree (created_at DESC);


--
-- Name: idx_iris_document_audit_document; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_iris_document_audit_document ON public.iris_document_audit USING btree (document_id, created_at DESC) WHERE (document_id IS NOT NULL);


--
-- Name: idx_iris_document_chunks_document; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_iris_document_chunks_document ON public.iris_document_chunks USING btree (document_id, chunk_index);


--
-- Name: idx_iris_document_chunks_search_vector; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_iris_document_chunks_search_vector ON public.iris_document_chunks USING gin (search_vector);


--
-- Name: idx_iris_documents_active_filters; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_iris_documents_active_filters ON public.iris_documents USING btree (language, country, category, product_slug) WHERE ((is_active = true) AND (retired_at IS NULL));


--
-- Name: idx_iris_documents_effective_dates; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_iris_documents_effective_dates ON public.iris_documents USING btree (effective_from, effective_until);


--
-- Name: idx_iris_documents_one_active_version; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_iris_documents_one_active_version ON public.iris_documents USING btree (document_family_key, language, country) WHERE ((is_active = true) AND (retired_at IS NULL));


--
-- Name: idx_iris_documents_version_scope; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_iris_documents_version_scope ON public.iris_documents USING btree (document_family_key, COALESCE(version_label, ''::text), language, country);


--
-- Name: idx_iris_search_aliases_active_product; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_iris_search_aliases_active_product ON public.iris_search_aliases USING btree (product_slug, language, country) WHERE (is_active = true);


--
-- Name: idx_iris_search_aliases_scope; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_iris_search_aliases_scope ON public.iris_search_aliases USING btree (alias_normalized, COALESCE(language, ''::text), COALESCE(country, ''::text));


--
-- Name: iris_document_audit iris_document_audit_document_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.iris_document_audit
    ADD CONSTRAINT iris_document_audit_document_fk FOREIGN KEY (document_id) REFERENCES public.iris_documents(id) ON DELETE RESTRICT;


--
-- Name: iris_document_chunks iris_document_chunks_document_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.iris_document_chunks
    ADD CONSTRAINT iris_document_chunks_document_fk FOREIGN KEY (document_id) REFERENCES public.iris_documents(id) ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--

\unrestrict Cl8VaMMehanvnvJ2D7J0cXwTN0GKeeS0UFLGmapYGkdgUjxnb8e5iDuhJF95uVv

