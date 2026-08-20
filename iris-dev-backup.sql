--
-- PostgreSQL database dump
--

\restrict yNXMACEZFn1ATYZId7KtDBEfyuEgwtuXmWx8Bc8zBK4PBCYfinlMtRvvbYXvtQq

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

--
-- Data for Name: iris_documents; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.iris_documents VALUES (1, 'doc_00207bc8-ea01-458f-9116-f137b1e6a92f', 'family_80b8325b-c0a8-4a81-9e37-2b66d9419366', 'Collagen Plus', 'Material Collagen', 'collagen-pdf-v1', 'Nutrilite', 'approved', 'provided-by-nuapp-owner-2026-08-18', 'es', 'US', 'marketing-product', 'collagen-plus', 'v1', NULL, NULL, 'iris/documents/v1/family_80b8325b-c0a8-4a81-9e37-2b66d9419366/doc_00207bc8-ea01-458f-9116-f137b1e6a92f/90f0a6f0b841e803a21ff565da381edf44785f2a25dbe6965f7aa7adb46a5dc3/original.pdf', 'application/pdf', '90f0a6f0b841e803a21ff565da381edf44785f2a25dbe6965f7aa7adb46a5dc3', true, NULL, '2026-08-18 17:27:06.245155+00', '2026-08-19 18:22:56.634+00');


--
-- Data for Name: iris_document_audit; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.iris_document_audit VALUES (1, 1, 'nuapp-iris-admin-v1', 'document_created', '{"country": "US", "category": "marketing-product", "language": "es", "chunkCount": 1, "productSlug": "collagen-plus"}', NULL, '2026-08-18 17:27:06.245155+00');
INSERT INTO public.iris_document_audit VALUES (2, 1, 'nachoa84', 'document_reviewed', '{"decision": "reviewed"}', NULL, '2026-08-19 18:14:57.289535+00');
INSERT INTO public.iris_document_audit VALUES (3, 1, 'nachoa84', 'document_reviewed', '{"decision": "approved"}', NULL, '2026-08-19 18:21:07.255599+00');
INSERT INTO public.iris_document_audit VALUES (4, 1, 'nachoa84', 'document_activated', '{}', NULL, '2026-08-19 18:22:56.666631+00');


--
-- Data for Name: iris_document_chunks; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.iris_document_chunks VALUES (1, 1, 0, NULL, '86990398

Te compartimos algunas ideas:
1. Cuando recibas tu kit, graba un
unboxing video y súbelo a tus
redes sociales etiquetando
nuestra cuenta @nuskinlatam
2. Cuenta tu emoción de ser de los
primeros en tener el producto en
tu país lQué cosas puedes decir de Collagen+?
- Aumenta la producción de colágeno y
elastina en la piel
- Ayuda a mejorar la luminosidad de la piel
- Ayuda a proteger la piel contra la luz azul
- Favorece la hidratación y los niveles de
humectación
- Ayuda a reducir visiblemente las líneas
de expresión y las arrugas
"''Declaraciones aprobadas solo
para Estados Unidos
3. Úsalo por un mes o más y documenta
tu proceso con fotos cada semana o 2
semanas (recuerda seguir los
lineamientos para fotos de antes y
después). Sube tu contenido en la
página de Collagen+ de tu mercado.
4. Utiliza esta etiqueta cuando hagas
publicaciones en redes sociales:
#Collagen+LATAM', '1252f5a42fae5434ab62e940b851e70859385c9e77e30a7f7f950ff0169c8f4f', '86990398 te compartimos algunas ideas: 1. cuando recibas tu kit, graba un unboxing video y subelo a tus redes sociales etiquetando nuestra cuenta @nuskinlatam 2. cuenta tu emocion de ser de los primeros en tener el producto en tu pais lque cosas puedes decir de collagen+? - aumenta la produccion de colageno y elastina en la piel - ayuda a mejorar la luminosidad de la piel - ayuda a proteger la piel contra la luz azul - favorece la hidratacion y los niveles de humectacion - ayuda a reducir visiblemente las lineas de expresion y las arrugas "''declaraciones aprobadas solo para estados unidos 3. usalo por un mes o mas y documenta tu proceso con fotos cada semana o 2 semanas (recuerda seguir los lineamientos para fotos de antes y despues). sube tu contenido en la pagina de collagen+ de tu mercado. 4. utiliza esta etiqueta cuando hagas publicaciones en redes sociales: #collagen+latam', 0, 891, DEFAULT, '2026-08-18 17:27:06.245155+00');


--
-- Data for Name: iris_search_aliases; Type: TABLE DATA; Schema: public; Owner: postgres
--



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
-- PostgreSQL database dump complete
--

\unrestrict yNXMACEZFn1ATYZId7KtDBEfyuEgwtuXmWx8Bc8zBK4PBCYfinlMtRvvbYXvtQq

