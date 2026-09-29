# Joker RPG — Sistema Web de Batalha Tática, Cartas e PvP

O **Joker RPG** é uma plataforma RPG tática baseada na web, construída com arquitetura monolítica modular de alta fidelidade e persistência relacional rigorosa. O sistema integra gerenciamento de heróis, baralhos de cartas colecionáveis dinâmicas, mecânicas táticas de combate por turnos com resolução autoritativa no servidor, controle de postura (*Break System*), cadeias de combos, efeitos de status contínuos e batalhas síncronas PvP em tempo real utilizando WebSockets.

---

## 1. Stack Tecnológica

- **Backend:** Node.js (LTS), Express.js
- **Frontend / Engine de Apresentação:** EJS (Embedded JavaScript), HTML5 semântico, CSS3 modularizado e escopado por view, JavaScript Vanilla (ES6+) moderno, Bootstrap 5.3 (restringido a grid flexível e utilitários dimensionais)
- **Banco de Dados:** PostgreSQL 16 (Hospedado no Neon Serverless Database com SSL obrigatório)
- **Comunicação em Tempo Real:** Socket.IO v4
- **Segurança & Sessões:** `express-session`, `connect-pg-simple` (sessões persistidas no banco), `bcryptjs` (salt rounds 12), `helmet`, `express-rate-limit`
- **Upload e Imagens:** `multer` em buffer de memória, gravando binários diretamente no PostgreSQL via coluna de tipo `BYTEA`
- **Autenticação Externa:** Google OAuth 2.0 via `google-auth-library`

---

## 2. Estrutura Arquitetural

A estrutura do projeto está organizada em três diretórios centrais:

```text
JOKER-RPG/
├── database/          # Conexão, controle de migrações, scripts de seed e esquemas SQL
├── server/            # Configurações, controladores, regras de negócio (services), validadores, modelos e sockets
├── client/            # Views EJS organizadas por domínio funcional e assets estáticos públicos
├── package.json
├── .env.example
├── .gitignore
├── README.md
└── index.js           # Ponto de entrada e inicialização do servidor HTTP e WebSocket
Fluxo de Requisição Autoritativo
code
Text
CLIENT (Navegador)
      │
      ▼  (HTTP POST / Socket Event)
ROUTE / SOCKET GATEWAY
      │
      ▼
MIDDLEWARES (Rate Limit, Sessão, Autenticação, Perfis RBAC)
      │
      ▼
CONTROLLER (Sanitização e Orquestração)
      │
      ▼
SERVICES DE DOMÍNIO (Validações de Regras, Turnos, Energia, Fórmulas de Dano, Combos, Break)
      │
      ▼
MODELS (Consultas parametrizadas e Transações ACID)
      │
      ▼
POSTGRESQL NEON (Persistência Definitiva)
Regra Fundamental de Segurança: O navegador do usuário nunca calcula dano, vida (HP), energia, pontos de postura (Break), ganho de experiência (XP), moedas ou resultados de disputas. O frontend apenas emite intenções de ação que são integralmente processadas, recalculadas e persistidas pelo servidor.
3. Requisitos de Ambiente
Node.js: Versão 18.0.0 ou superior (recomendado Node 20 LTS)
NPM: Versão 9.0.0 ou superior
Instância PostgreSQL: Banco de dados PostgreSQL acessível (Neon Database recomendado)
4. Instalação e Configuração
Passo 1: Clonar o Repositório e Instalar Dependências
code
Bash
git clone <url-do-repositorio>
cd JOKER-RPG
npm install
Passo 2: Configuração de Variáveis de Ambiente
Crie um arquivo .env na raiz do projeto com base no arquivo .env.example:
code
Bash
cp .env.example .env
Preencha os valores obrigatórios no arquivo .env:
code
Env
PORT=3000
NODE_ENV=development

# String de Conexão Neon PostgreSQL com SSL obrigatório
DATABASE_URL=postgresql://usuario:senha@ep-flat-boat-b540dujy-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require

# Chave Secreta para Criptografia de Sessão
SESSION_SECRET=defina_uma_string_secreta_longa_e_aleatoria

# Integração Google OAuth 2.0
GOOGLE_CLIENT_ID=seu_client_id_google
GOOGLE_CLIENT_SECRET=seu_client_secret_google
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# URL da Aplicação
APP_URL=http://localhost:3000

# Administrador Supremo Inicial para Execução de Seeds
ADMIN_DEFAULT_USERNAME=admin_supremo
ADMIN_DEFAULT_EMAIL=admin@jokerpg.com
ADMIN_DEFAULT_PASSWORD=senha_segura_inicial_troque_apos_primeiro_login
5. Banco de Dados: Migrations e Seeds
O sistema conta com orquestrador próprio de migrações e sementes de dados (database/migrate.js e database/seed.js), não dependendo de ORMs pesados.
Executar Migrações Estruturais
Cria as tabelas relacionais, índices de alta velocidade e tabelas de controle de sessão:
code
Bash
npm run migrate
As migrações são executadas em ordem numérica sequencial:
001_create_users_and_auth.sql — Tabelas de contas, perfis, credenciais locais e resets
002_create_characters.sql — Catálogo mestre de personagens e vínculos de jogadores
003_create_cards.sql — Catálogo mestre de cartas e inventário de cartas dos usuários
004_create_decks.sql — Estrutura de baralhos ativos e slots associados
005_create_battles_and_history.sql — Partidas, snapshots de combatentes e logs de ação
006_create_missions.sql — Catálogo de missões do jogo e progresso individual
007_create_rankings_and_seasons.sql — Tabela otimizada de classificação e temporadas competitivas
008_create_admin_logs_and_sessions.sql — Tabela de auditoria administrativa e armazenamento de sessões Express
Executar Sementes Iniciais (Seeds)
Insere os personagens canônicos, cartas elementais, missões básicas e a conta mestre do Administrador Supremo (definida no .env):
code
Bash
npm run seed
Aviso de Integridade: As migrações e seeds utilizam instruções seguras (CREATE TABLE IF NOT EXISTS, INSERT ... ON CONFLICT DO NOTHING). Elas nunca deletam tabelas ou registros existentes em execuções subsequentes.
6. Execução da Aplicação
Modo Desenvolvimento (Hot Reload com Nodemon)
code
Bash
npm run dev
Acesse a interface no navegador em: http://localhost:3000
Modo Produção
code
Bash
npm start
7. Mecânicas Centrais de Gameplay
Gestão de Energia e Turnos: Cada combatente recupera parcelas calculadas de energia no início da rodada, determinando quais cartas podem ser jogadas.
Sistema de Postura (Break Gauge): Danos físicos pesados e vantagens elementais esgotam a barra de Break do oponente. Ao atingir 0, o defensor entra em colapso (Break), sofrendo 50% a mais de dano e perdendo a capacidade de esquivar ou contra-atacar por uma rodada.
Reações de Defesa:
Block: Mitigação proporcional ao atributo de defesa base.
Dodge: Teste percentual derivado da velocidade para anular 100% do impacto.
Counter: Absorve fração do impacto e devolve represália imediata automática.
Cadeias de Combos: O encadeamento de tipos de cartas compatíveis na mesma rodada ativa multiplicadores sequenciais de dano (Combo x2, x3, x4, x5).
Afinidades Elementais: Relações circulares de fraqueza e resistência entre Fogo, Água, Vento, Terra, Raio, Luz e Trevas.
8. Procedimentos de Deploy em Produção (Render)
Crie um novo Web Service no painel do Render.
Conecte o repositório Git correspondente.
Defina as seguintes configurações:
Environment: Node
Build Command: npm install
Start Command: npm run migrate && npm run seed && npm start
Na aba Environment Variables, adicione as chaves contidas no .env:
DATABASE_URL (string de conexão do Neon)
SESSION_SECRET (string aleatória e criptograficamente segura)
NODE_ENV=production
PORT=10000 (ou a porta atribuída pelo Render)
APP_URL=https://jokerpg.onrender.com
GOOGLE_CALLBACK_URL=https://jokerpg.onrender.com/auth/google/callback
GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET
9. Licença e Direitos
Projeto desenvolvido sob a especificação técnica Joker RPG. Todos os direitos reservados.