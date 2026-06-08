# Zlaya RN MVP — Backend

Backend Node.js + Express para o **piloto RN (0–28 dias)** da IA conversacional Zlaya, baseada no Método Eliana Dias.

Este serviço implementa toda a arquitetura combinada com o cliente:

- isolamento absoluto por faixa etária (namespace RN)
- pipeline RAG controlado (embedding → busca vetorial → reranking → confiança)
- roteador de 7 caminhos operacionais (responder, perguntar, encaminhar para aula, fallback, avaliação profissional, bloqueio pós-geração, suporte humano)
- regras metodológicas fixas + termos/interpretações proibidas
- detecção de sinais clínicos de alerta
- guard pós-geração (anti-alucinação)
- auditoria completa por turno (arquivo JSONL ou PostgreSQL)
- modo de operação totalmente local (sem dependência de chave externa para o demo)

## Stack

- Node.js ≥ 20, ES Modules
- Express 4 + Zod (validação)
- OpenAI SDK (chat + embeddings) com **fallback determinístico local** quando não há `OPENAI_API_KEY`
- Armazenamento vetorial em arquivo (`data/vector-store.json`) — contrato pronto para Pinecone/Qdrant/pgvector
- PostgreSQL opcional para auditoria

## Setup rápido

```bash
cd backend
npm install
cp .env.example .env

# 1) Construir o índice vetorial a partir da base autorizada (RN)
npm run ingest

# 2) Subir o servidor
npm run dev          # ou: npm start
# → http://localhost:4000
```

### Sem chave OpenAI

Se `OPENAI_API_KEY` estiver vazio (padrão), o backend usa automaticamente:

- embeddings locais determinísticos (hash-based, 384 dim)
- gerador de respostas baseado em template (cita o chunk líder + chunks de apoio + perguntas de aprofundamento)

O comportamento de roteamento, isolamento por faixa, fallback, guard e auditoria é o mesmo.

### Com chave OpenAI

```env
OPENAI_API_KEY=sk-...
OPENAI_CHAT_MODEL=gpt-4o-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

Depois rode `npm run ingest` novamente para reconstruir o índice com embeddings reais.

## Endpoints

| Método | Path                       | Descrição                                                     |
|-------:|----------------------------|---------------------------------------------------------------|
| GET    | `/api/health`              | Status do servidor, provedor de LLM e estado do índice        |
| POST   | `/api/chat`                | Processa um turno completo do pipeline                        |
| GET    | `/api/audit/recent?limit=N`| Últimos N turnos auditados                                    |
| GET    | `/api/audit/config`        | Snapshot dos parâmetros de retrieval / provedores             |
| GET    | `/api/audit/index`         | Metadados do índice vetorial                                  |
| GET    | `/api/profile/bands`       | Faixas etárias oficiais e namespaces ativos no piloto         |
| POST   | `/api/profile/resolve`     | Resolve `ageDays`/`birthDate` → banda + pilot active          |

### Exemplo de chamada

```bash
curl -X POST http://localhost:4000/api/chat \
  -H 'content-type: application/json' \
  -d '{
    "conversationId": "demo-1",
    "message": "Meu bebê de 17 dias só dorme mamando e acorda quando coloco no berço.",
    "babyProfile": { "motherName": "Ana", "babyName": "Lara", "ageDays": 17 },
    "conversation": []
  }'
```

A resposta contém: `intent`, `retrieval` (com chunks e scores), `route`, `routeDetails`, `safety`, `clinical`, `response.text`, `response.kind`, `response.suggestedLessons`, `durationMs` e `audit.stored`.

## Cenários críticos

```bash
npm run test:scenarios
```

Roda um conjunto de prompts intencionalmente difíceis para validar isolamento por faixa, prevenção de alucinação, encaminhamentos clínicos e fallback.

## Estrutura

```
backend/
├── src/
│   ├── server.js                       # entrypoint Express
│   ├── config/index.js                 # leitura de .env, paths, namespaces ativos
│   ├── knowledge/
│   │   ├── ageBands.json               # faixas etárias oficiais
│   │   ├── intents.json                # catálogo de intenções
│   │   └── rn/
│   │       ├── rules.json              # regras fixas + hierarquias de investigação + red flags
│   │       ├── forbidden.json          # termos/interpretações/linguagem proibidos
│   │       ├── lessons.json            # mapeamento situações → aulas internas
│   │       └── chunks.json             # unidades indexáveis da base RN
│   ├── prompts/systemPrompt.js         # construção do system prompt restritivo
│   ├── services/
│   │   ├── openaiClient.js
│   │   ├── ageService.js               # Etapa 1 — enquadramento por idade
│   │   ├── intentClassifier.js         # Etapa 2 — classificação de intenção (LLM ou keyword fallback)
│   │   ├── safetyValidator.js          # Etapa 2b/7 — red flags + termos proibidos
│   │   ├── embeddings.js               # OpenAI ou hash-based local
│   │   ├── vectorStore.js              # índice em arquivo (mesma interface para Pinecone/Qdrant)
│   │   ├── retrieval.js                # Etapa 4 — busca + reranking + confiança
│   │   ├── decisionRouter.js           # Etapa 5 — 7 caminhos operacionais
│   │   ├── responseGenerator.js        # Etapa 6 — LLM ou composer local
│   │   ├── fallback.js                 # render templated para Caminhos 2-7
│   │   ├── auditLogger.js              # JSONL ou PostgreSQL
│   │   └── zlayaPipeline.js            # orquestrador (entrada única do turno)
│   ├── routes/                         # chat / audit / profile / health
│   ├── scripts/
│   │   ├── ingest.js                   # constrói o índice vetorial
│   │   └── runCriticalScenarios.js     # bateria de testes críticos
│   └── db/schema.sql                   # DDL opcional do PostgreSQL
├── package.json
├── .env.example
└── README.md
```

## Como o pipeline decide um turno

```
            ┌─────────────────────────────────────────────────────────────┐
            │  Etapa 1 — Enquadramento por idade                           │
            │     ageService.resolveAge(profile) → band                    │
            │     Se band ∉ activeNamespaces → Caminho 7                   │
            └─────────────────────────────────────────────────────────────┘
                          │
            ┌─────────────────────────────────────────────────────────────┐
            │  Etapa 2 — Classificação de intenção                         │
            │     intentClassifier.classifyIntent(message)                 │
            │     (LLM via OpenAI; keyword fallback automaticamente)       │
            └─────────────────────────────────────────────────────────────┘
                          │
            ┌─────────────────────────────────────────────────────────────┐
            │  Etapa 2b — Red flags clínicos                               │
            │     safetyValidator.detectClinicalRedFlags                   │
            │     Se hasRedFlag → Caminho 5 (recommend_professional)       │
            └─────────────────────────────────────────────────────────────┘
                          │
            ┌─────────────────────────────────────────────────────────────┐
            │  Etapa 3 — Avaliação de contexto                             │
            │     (idade exata presente? pergunta vaga?)                   │
            └─────────────────────────────────────────────────────────────┘
                          │
            ┌─────────────────────────────────────────────────────────────┐
            │  Etapa 4 — RAG controlado                                    │
            │     embeddings.embedOne(query)                               │
            │     vectorStore.search(namespace=RN, topK)                   │
            │     intent-aware reranking                                   │
            │     confidence = topSim*0.7 + coverage*0.2 + intentBoost     │
            └─────────────────────────────────────────────────────────────┘
                          │
            ┌─────────────────────────────────────────────────────────────┐
            │  Etapa 5 — Decisão operacional (decisionRouter.decideRoute)  │
            │   1) ANSWER_DIRECTLY     conf ≥ minConf                      │
            │   2) ASK_MORE_CONTEXT    chunk líder pede contexto + vague   │
            │   3) FORWARD_TO_LESSON   conf moderada + lessons mapeadas    │
            │   4) FALLBACK            conf baixa / intenção ambígua       │
            │   5) RECOMMEND_PROFESSIONAL  red flag clínico                │
            │   6) INTERRUPT_UNSAFE    post-gen safety violation           │
            │   7) ROUTE_TO_HUMAN_SUPPORT  fora_da_base / sem retrieval    │
            └─────────────────────────────────────────────────────────────┘
                          │
            ┌─────────────────────────────────────────────────────────────┐
            │  Etapa 6 — Geração                                           │
            │     Se Caminho 1: responseGenerator.generateAnswer           │
            │                    (LLM + system prompt restritivo)          │
            │     Caso contrário: fallback.renderRoute (template determinístico) │
            └─────────────────────────────────────────────────────────────┘
                          │
            ┌─────────────────────────────────────────────────────────────┐
            │  Etapa 7 — Guard pós-geração                                 │
            │     safetyValidator.checkForbiddenContent                    │
            │     Se violação → postGenerationGuard → Caminho 6 override   │
            └─────────────────────────────────────────────────────────────┘
                          │
            ┌─────────────────────────────────────────────────────────────┐
            │  Auditoria                                                   │
            │     auditLogger.recordTurn(...)                              │
            │     → PostgreSQL (se DATABASE_URL) ou data/audit-log.jsonl   │
            └─────────────────────────────────────────────────────────────┘
```

## Escalando para outras faixas etárias

Para adicionar uma faixa (por exemplo `30_60`):

1. Criar `src/knowledge/30_60/` com `rules.json`, `forbidden.json`, `lessons.json`, `chunks.json` no mesmo formato do RN.
2. Acrescentar a sigla em `ACTIVE_NAMESPACES` no `.env`.
3. Rodar `npm run ingest` novamente.

O isolamento por namespace já é absoluto na busca vetorial — chunks de outras faixas nunca contaminam o resultado.
