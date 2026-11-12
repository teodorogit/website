# Escopo do backend

Documento de implementação para o backend real do sistema. O frontend atual usa repositórios locais e dados de demonstração; as rotas abaixo definem o contrato para substituí-los por uma API persistente.

## 1. Convenções da API

- Prefixo: `/api`; versão inicial sem versionamento explícito.
- Formato: JSON UTF-8. Valores monetários são enviados em reais como números decimais na API e armazenados como centavos inteiros no banco.
- Datas de calendário: `YYYY-MM-DD`. Datas e horas persistidas: `timestamptz`; interpretar datas e agrupar por dia, dia da semana, semana, mês e ano no fuso horário do usuário, inicialmente `America/Sao_Paulo`.
- Identificadores: UUID. O usuário dono dos dados é sempre determinado pela identidade autenticada, nunca por um `userId` confiado no corpo da requisição.
- Proteger rotas de dados com um JWT de sessão do Clerk validado no backend. O frontend ainda precisa incluir o token nas chamadas à API. O webhook de sincronização de usuários é opcional: o backend pode criar a linha local do usuário na primeira chamada autenticada.
- Resposta de erro uniforme:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Revise os campos enviados.",
    "details": [{ "field": "quantity", "message": "Deve ser maior que zero." }]
  }
}
```

Usar `400` para entrada inválida, `401` sem autenticação, `403` sem permissão, `404` para recurso inexistente do usuário, `409` para conflito, `429` para excesso de requisições simultâneas e `500` para falha inesperada. Nunca retornar stack trace, segredo ou prompt interno.

## 2. Rotas por página

### Login e navegação

O login, logout e a sessão já são controlados pelo Clerk no frontend. Não criar login/senha paralelo no backend. As páginas protegidas devem enviar o token Clerk e o backend deve validar assinatura, emissor e expiração. Não é necessário endpoint de login próprio.

### Home (`/home`)

Usa a data selecionada, visualização diária ou semanal, catálogo de produtos, registro rápido de venda e meta de vendas.

#### `GET /api/products`

Lista produtos ativos do usuário, ordenados pelo nome.

Resposta `200`:

```json
{
  "items": [
    {
      "id": "uuid",
      "name": "Brigadeiro",
      "price": 3.0,
      "preparationCost": 0.0,
      "createdAt": "2026-10-24T12:00:00.000Z",
      "updatedAt": "2026-10-24T12:00:00.000Z"
    }
  ]
}
```

#### `GET /api/sales?date=YYYY-MM-DD`

Lista as vendas da data local selecionada pela Home. Deve incluir `productName`, `unitPrice` e `unitCost` salvos na venda para manter o histórico, mesmo que o produto mude ou seja removido.

Resposta `200`:

```json
{
  "items": [
    {
      "id": "uuid",
      "productId": "uuid",
      "productName": "Brigadeiro",
      "unitPrice": 3.0,
      "unitCost": 1.0,
      "quantity": 2,
      "total": 6.0,
      "profit": 4.0,
      "date": "2026-10-24",
      "time": "12:30"
    }
  ]
}
```

- `unitCost` é o custo de preparo unitário do produto no momento da venda. `0` também significa "custo não informado": é o padrão do cadastro de produto. Vendas registradas antes de essa coluna existir receberam o custo que o produto tinha quando a migração rodou (ou `0`, se o produto já tinha sido excluído).
- `total = unitPrice × quantity` e `profit = (unitPrice − unitCost) × quantity`, calculados no servidor em centavos. `profit` pode ser negativo.

#### `GET /api/sales?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`

Mesma rota para o histórico da página Vendas. Datas são inclusivas; aceitar somente um limite também. Validar que `startDate <= endDate`; ordenar por data e hora decrescentes. Sem filtros, retornar todas as vendas paginadas (ver seção de paginação).

#### `POST /api/sales`

Registra uma venda usando o preço e o custo de preparo atuais do produto no backend, sem confiar em preço, custo ou nome enviados pelo navegador.

Corpo:

```json
{ "productId": "uuid", "quantity": 2, "date": "2026-10-24" }
```

Validar produto pertencente ao usuário, `quantity` inteiro positivo e data válida. Criar a venda e capturar nome, preço unitário e custo de preparo unitário do produto na mesma transação.

Resposta `201`: objeto de venda no mesmo formato de `GET /api/sales`.

#### `GET /api/sales-goal`

Retorna a meta individual do usuário:

```json
{ "amount": 1000.0, "updatedAt": "2026-10-24T12:00:00.000Z" }
```

Se não houver meta, responder `200` com `{ "amount": null, "updatedAt": null }`.

#### `PUT /api/sales-goal`

Cria ou substitui a meta do usuário (uma meta por usuário).

Corpo: `{ "amount": 1000.0 }`. Validar valor numérico finito maior que zero. Resposta `200` com a representação da meta.

Na Home, o total diário/semanal, o custo de preparação e o lucro são derivados dos registros de venda retornados: somar `total` e `profit` de cada venda (custo = total − lucro). Não usar o `preparationCost` atual do catálogo, como fazia o protótipo: ele muda com o tempo e faria a Home discordar do Dashboard, que usa o custo gravado em cada venda.

### Dashboard (`/dashboard`)

#### `GET /api/dashboard?weeks=8`

Retorna os valores do gráfico de meta atual e a série semanal usada pelo gráfico de linha. `weeks` é opcional, padrão `8`, validar intervalo de `1` a `52`. As semanas começam na segunda-feira no fuso horário do usuário; incluir semanas sem venda com total zero.

Resposta `200`:

```json
{
  "currency": "BRL",
  "salesGoal": 1000.0,
  "sold": 450.0,
  "remaining": 550.0,
  "weeklySales": [
    { "weekStart": "2026-09-07", "weekEnd": "2026-09-13", "total": 120.0 },
    { "weekStart": "2026-09-14", "weekEnd": "2026-09-20", "total": 0.0 }
  ],
  "bestWeek": {
    "weekStart": "2026-09-07",
    "weekEnd": "2026-09-13",
    "total": 120.0
  }
}
```

`sold` deve preservar o comportamento atual do gráfico de meta: soma de todas as vendas do usuário. `remaining = max(0, salesGoal - sold)`; quando não há meta, `salesGoal` e `remaining` podem ser `null` e zero, respectivamente, desde que o frontend trate o caso. `bestWeek` deve ser `null` quando não houver vendas no período. A API agrega `total = quantidade × preço unitário histórico`.

#### `GET /api/dashboard/metrics?year=2026&month=11`

Métricas de vendas de um ano: produto que mais vendeu, média de vendas, dia da semana que mais vende, semana do mês que mais vende e lucro mensal × anual.

Parâmetros (ambos opcionais; qualquer outro parâmetro é `400`):

| Parâmetro | Tipo | Padrão | Regra |
|---|---|---|---|
| `year` | inteiro, `2000` a `9998` | o ano atual no fuso do usuário | Ano das métricas. |
| `month` | inteiro, `1` a `12` | ausente | Restringe o período àquele mês do ano. `month` sem `year` é aquele mês do ano atual. |

Há dois escopos na mesma resposta:

- **O período** é o ano inteiro ou, com `month`, aquele mês. Vale para `totals`, `averageSales`, `topProducts`, `bestSellingProduct`, `salesByWeekday`, `bestWeekday`, `salesByWeekOfMonth` e `bestWeekOfMonth`.
- **O ano inteiro**, com ou sem `month`, vale para `monthlyProfit` e `annualProfit`. O "lucro mensal × anual" é `monthlyProfit[m − 1]` contra `annualProfit`.

Resposta `200` (os arrays abaixo mostram só o primeiro item):

```json
{
  "currency": "BRL",
  "year": 2026,
  "month": null,
  "period": { "startDate": "2026-01-01", "endDate": "2026-12-31" },
  "firstSaleDate": "2025-03-14",
  "totals": {
    "revenue": 318.97,
    "cost": 80.5,
    "profit": 238.47,
    "revenueWithoutCost": 12.0,
    "quantity": 62,
    "salesCount": 40,
    "sellingDays": 18
  },
  "averageSales": { "perSellingDay": 17.72, "perSale": 7.97 },
  "bestSellingProduct": { "productId": "uuid", "productName": "Brigadeiro", "quantity": 40, "revenue": 120.0 },
  "topProducts": [{ "productId": "uuid", "productName": "Brigadeiro", "quantity": 40, "revenue": 120.0 }],
  "salesByWeekday": [
    { "isoWeekday": 1, "revenue": 30.0, "quantity": 8, "salesCount": 5, "occurrences": 45, "averageRevenue": 0.67 }
  ],
  "bestWeekday": {
    "isoWeekday": 6,
    "revenue": 90.0,
    "quantity": 20,
    "salesCount": 12,
    "occurrences": 45,
    "averageRevenue": 2.0
  },
  "salesByWeekOfMonth": [
    {
      "weekOfMonth": 1,
      "startDay": 1,
      "endDay": 7,
      "revenue": 120.0,
      "quantity": 25,
      "salesCount": 15,
      "months": 10,
      "averageRevenue": 12.0
    }
  ],
  "bestWeekOfMonth": {
    "weekOfMonth": 1,
    "startDay": 1,
    "endDay": 7,
    "revenue": 120.0,
    "quantity": 25,
    "salesCount": 15,
    "months": 10,
    "averageRevenue": 12.0
  },
  "monthlyProfit": [{ "month": 1, "revenue": 0, "cost": 0, "profit": 0, "revenueWithoutCost": 0 }],
  "annualProfit": { "revenue": 318.97, "cost": 80.5, "profit": 238.47, "revenueWithoutCost": 12.0 }
}
```

Campos. Valores em dinheiro são reais com até duas casas; contagens são inteiros.

| Campo | Significado |
|---|---|
| `year`, `month` | O ano usado (o pedido ou o atual) e o mês pedido; `month` é `null` no ano inteiro. |
| `period.startDate`, `period.endDate` | Primeiro e último dia do período, ambos inclusivos, como nos filtros de `GET /api/sales`. |
| `firstSaleDate` | Data da venda mais antiga do usuário, em qualquer ano; `null` sem vendas. Serve para montar um seletor de ano. |
| `revenue` | Faturamento: Σ quantidade × preço unitário histórico. É a mesma soma que `/api/dashboard` chama de `sold` e `total`. |
| `cost` | Σ quantidade × custo unitário gravado na venda (`unitCost`). |
| `profit` | `revenue − cost`. Pode ser negativo. |
| `revenueWithoutCost` | Parte do `revenue` vinda de vendas com `unitCost` 0. Acima de zero, o lucro está superestimado: a tela pode avisar que há faturamento sem custo cadastrado. |
| `totals.quantity` | Unidades vendidas no período. |
| `totals.salesCount` | Registros de venda no período. Um registro é uma linha de produto, não um pedido: a API não tem pedido nem cliente. |
| `totals.sellingDays` | Dias do período com pelo menos uma venda. |
| `averageSales.perSellingDay` | `revenue ÷ sellingDays`: média por dia **com venda**, não por dia do calendário. `null` sem vendas. |
| `averageSales.perSale` | `revenue ÷ salesCount`: valor médio de um registro de venda. Não é ticket médio por cliente. `null` sem vendas. |
| `topProducts` | Até 5 produtos do período, por unidades (desc), depois faturamento (desc), depois nome. Vazio sem vendas. |
| `bestSellingProduct` | O primeiro de `topProducts`; `null` sem vendas. |
| `salesByWeekday` | Sempre 7 itens em ordem, `isoWeekday` 1 = segunda … 7 = domingo (ISO 8601; **não** é o `getDay()` do JavaScript, em que domingo é 0). |
| `salesByWeekday[].occurrences` | Quantas vezes aquele dia da semana caiu entre o primeiro e o último dia com venda do período, contando os dias sem venda. 0 em todos quando o período não tem vendas. |
| `salesByWeekday[].averageRevenue` | `revenue ÷ occurrences`; `null` quando `occurrences` é 0. |
| `bestWeekday` | O item com a maior média (`revenue ÷ occurrences`); empate vai para o dia mais cedo na semana; `null` sem faturamento. |
| `salesByWeekOfMonth` | Sempre 5 itens em ordem. "Semana do mês" é um bloco fixo de dias do mês, sem relação com as semanas de segunda a domingo de `weeklySales`: 1 = dias 1–7, 2 = 8–14, 3 = 15–21, 4 = 22–28, 5 = 29–31. `startDay` e `endDay` trazem esses limites (sempre 29 e 31 no bloco 5, mesmo em mês mais curto). |
| `salesByWeekOfMonth[].months` | Em quantos meses do período aquele bloco teve pelo menos uma venda. |
| `salesByWeekOfMonth[].averageRevenue` | `revenue ÷ months`; `null` quando `months` é 0. |
| `bestWeekOfMonth` | O item com a maior média (`revenue ÷ months`); empate vai para o bloco mais cedo; `null` sem faturamento. |
| `monthlyProfit` | Sempre 12 itens, `month` 1 = janeiro … 12 = dezembro (o mês `m` está no índice `m − 1`), com zeros nos meses sem venda. |
| `annualProfit` | Soma dos 12 meses. Na visão do ano inteiro, é igual a `totals`. |

Regras:

- Todo agrupamento (dia, dia da semana, bloco do mês, mês, ano) usa o fuso horário do usuário.
- Os dois "melhores" (`bestWeekday`, `bestWeekOfMonth`) são eleitos pela média, não pelo total, e a comparação é exata (não usa a média arredondada). Pelo total o calendário decidiria: num ano em andamento o bloco 1 já aconteceu uma vez a mais que os seguintes, e num mês alguns dias da semana caem cinco vezes e outros quatro. O total de cada item continua em `revenue`.
- Produto, no ranking, é o nome resolvido, sem diferenciar maiúsculas de minúsculas (conforme o `lower()` do banco): o nome **atual** no catálogo enquanto a venda ainda aponta para um produto, senão o nome gravado na venda. Consequências: um produto renomeado é uma linha só, com o nome atual; um produto excluído e recriado com o mesmo nome é uma linha só, com o `productId` novo; um produto excluído aparece uma vez por nome sob o qual foi vendido, com `productId` `null` (excluir um produto que tinha sido renomeado divide a linha dele).
- `topProducts[].productName` é o nome atual do catálogo (ou, com `productId` `null`, o nome da venda mais recente) e pode ser diferente do `productName` das vendas, que é o nome da época. Ligar uma linha do ranking a um produto pelo `productId`, nunca pelo nome.
- O corte em 5 é por unidades: um produto de poucas unidades e muito faturamento pode ficar de fora da lista, mas continua contado em `totals`.
- Vendas com data futura contam no dia em que estão datadas; nada é limitado a "hoje".
- Vendas datadas antes do ano 2000 aparecem em `GET /api/sales` e no `sold` de `/api/dashboard`, mas em nenhuma consulta de métricas.
- `400` com `VALIDATION_ERROR` e `details` para `year` ou `month` inválidos.

### Vendas (`/sales`)

Além dos `GET` e `POST /api/sales` descritos na Home:

#### `PATCH /api/sales/:id`

Atualiza produto, quantidade e/ou data de uma venda. Corpo parcial com campos permitidos: `{ "productId": "uuid", "quantity": 3, "date": "2026-10-23" }`. Se trocar o produto, atualizar juntos o vínculo, nome, preço e custo históricos a partir do catálogo atual. Alterar só a quantidade ou a data mantém o preço e o custo gravados. Para venda histórica cujo produto foi apagado, permitir manter o snapshot sem vínculo. Resposta `200` com a venda atualizada.

#### `DELETE /api/sales/:id`

Exclui somente venda pertencente ao usuário autenticado. Resposta `204`; `404` se não existir ou não pertencer ao usuário.

### Produtos (`/products`)

Além de `GET /api/products` descrito na Home:

#### `POST /api/products`

Corpo: `{ "name": "Brownie", "price": 8.0, "preparationCost": 2.5 }`.

Validar nome não vazio (máximo 32 caracteres, conforme formulário), preço maior que zero, custo maior ou igual a zero, ambos finitos e com no máximo duas casas decimais. Resposta `201` com o produto criado. Cada usuário pode ter no máximo 500 produtos; acima disso, `409` com `PRODUCT_LIMIT_REACHED`.

#### `PATCH /api/products/:id`

Atualiza `name`, `price` e/ou `preparationCost` com as mesmas validações. Alterar preço não altera o preço histórico de vendas passadas, e alterar `preparationCost` não altera o custo nem o lucro de vendas já registradas: uma venda feita enquanto o produto estava com custo 0 continua com custo 0 depois que o custo é informado. Resposta `200` com o produto atualizado.

#### `DELETE /api/products/:id`

Remove o produto do catálogo do usuário. As vendas existentes devem continuar consultáveis com seus dados de snapshot; definir `sales.product_id` como `NULL` em vez de apagar vendas. As vendas mantêm nome, preço e custo gravados; nas métricas do Dashboard elas passam a aparecer sob o nome gravado, com `productId` `null`. Resposta `204`.

### Assistente de conversação (drawer presente nas páginas autenticadas)

#### `POST /api/chat`

Corpo:

```json
{
  "messages": [
    { "role": "assistant", "content": "Oi! Como posso ajudar?" },
    { "role": "user", "content": "Quais produtos vendem mais?" }
  ]
}
```

Aceitar até 20 mensagens, papéis `user` e `assistant`, conteúdo não vazio de até 4.000 caracteres, e exigir que a última mensagem seja do usuário. Não aceitar mensagens de sistema enviadas pelo cliente. Limitar as perguntas em andamento (padrão: 1 por usuário e 4 no processo, configuráveis); acima disso, `429` com `TOO_MANY_REQUESTS`.

Resposta `200`: `{ "reply": "..." }`.

Construir o contexto de RAG com produtos e vendas reais do usuário autenticado, substituindo dados de demonstração hard-coded. Quando não houver dados, dizer isso sem inventar resultados. Mensagens enviadas pelo usuário são dados não confiáveis: não permitir que instruções nelas substituam as regras de sistema ou revelem dados de outro usuário.

#### Cancelamento do botão Stop

O frontend cancela o `fetch` usando `AbortController`. Para interromper também o trabalho real do backend:

1. Criar um `AbortController` por requisição e observar `response` ser fechado antes de `response.writableEnded`.
2. Propagar o mesmo `signal` para buscas/embeddings e para a chamada `/api/chat` do Ollama.
3. Se houver cancelamento, parar o processamento, não tentar escrever resposta em conexão encerrada e não registrar `AbortError` como falha 502.
4. Não converter cancelamento em resposta de sucesso vazia. Erros reais continuam registrados e recebem resposta de erro apropriada quando a conexão ainda estiver aberta.

O handler atual usa geração não-streaming (`stream: false`). É suficiente para Stop se a desconexão HTTP for propagada até a chamada Ollama. Streaming/SSE não é necessário para esta primeira versão.

### Configurações (`/settings`)

A tela atual é somente um placeholder e não coleta dados. Nenhuma rota é necessária nesta etapa. Se passar a editar perfil ou preferências, definir os campos e a rota antes de persistir; não gravar configurações do usuário em variáveis globais do servidor.

### Saúde do serviço

#### `GET /api/health`

Verifica que o processo HTTP está ativo. Resposta `200`: `{ "status": "ok" }`. Não incluir env vars, credenciais ou detalhes internos. Uma verificação de dependências (PostgreSQL/Ollama) pode ser uma rota separada e protegida, sem expor endereços ou mensagens sensíveis.

## 3. Schemas do banco (PostgreSQL)

Valores monetários são centavos inteiros para evitar erros de ponto flutuante. Criar a linha em `users` no primeiro acesso autenticado. `clerk_user_id` é o identificador `sub` do JWT validado.

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id text NOT NULL UNIQUE,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name varchar(32) NOT NULL,
  price_cents integer NOT NULL CHECK (price_cents > 0),
  preparation_cost_cents integer NOT NULL DEFAULT 0
    CHECK (preparation_cost_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX products_user_name_unique
  ON products (user_id, lower(name));

CREATE INDEX products_user_created_idx
  ON products (user_id, created_at DESC);

CREATE TABLE sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name_snapshot varchar(32) NOT NULL,
  unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0),
  unit_cost_cents integer NOT NULL DEFAULT 0 CHECK (unit_cost_cents >= 0),
  quantity integer NOT NULL CHECK (quantity > 0),
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sales_user_occurred_idx
  ON sales (user_id, occurred_at DESC);

CREATE INDEX sales_user_product_idx
  ON sales (user_id, product_id);

CREATE TABLE sales_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

Ao criar ou editar uma venda, validar que `product_id` pertence ao mesmo `user_id`. Uma FK simples garante que o produto existe, mas a propriedade deve ser conferida na camada de serviço ou reforçada pelo desenho do banco. Na exclusão de produto, manter `product_name_snapshot`, `unit_price_cents` e `unit_cost_cents`; não apagar registros de venda.

`unit_cost_cents` é o custo de preparo unitário copiado do produto no momento da venda, do mesmo jeito que o preço, para que o lucro de um mês passado não mude quando o custo do produto é editado. `0` também significa custo não informado. A coluna foi adicionada numa segunda migração, que preencheu as vendas existentes com o custo atual do produto (e deixou `0` nas vendas de produtos já excluídos).

Não é necessário persistir conversas para o escopo atual: o frontend envia o histórico recente a cada chamada. Se for necessário histórico durável, acrescentar tabelas `chat_conversations` e `chat_messages` ligadas a `users`, com política de retenção e isolamento por usuário definidos.

## 4. Paginação, validação e isolamento

- Para listagens extensas, aceitar `limit` (padrão 50, máximo 100) e `cursor`; retornar `{ "items": [], "nextCursor": null }`.
- Validar UUIDs, datas ISO reais, inteiros e limites monetários no servidor; não confiar nas validações do formulário.
- Toda consulta de produtos, vendas, meta e dashboard deve filtrar pelo usuário obtido do token. Testar explicitamente que um usuário não consegue ler, editar ou excluir dados de outro.
- Criar/editar venda deve ser transacional e manter o snapshot consistente com o produto consultado.
- Recalcular dashboard e agregações a partir das vendas persistidas, não de valores enviados pelo cliente.

## 5. Rodar Ollama no Windows

1. Instalar Ollama pelo instalador oficial para Windows em [ollama.com/download](https://ollama.com/download). O aplicativo normalmente mantém o serviço local ativo após a instalação.
2. Abrir PowerShell e baixar os dois modelos configurados no backend:

```powershell
ollama pull llama3.2
ollama pull embeddinggemma
```

3. Confirmar serviço e modelos:

```powershell
Invoke-RestMethod http://localhost:11434/api/tags
```

O endpoint deve listar `llama3.2` e `embeddinggemma`. Se o aplicativo Ollama não estiver em execução, iniciar `ollama serve` em um terminal separado e mantê-lo aberto.

4. Copiar `backend/.env.example` para `backend/.env` e preencher os valores (não versionar segredos). Além de `PORT`, `OLLAMA_URL`, `CHAT_MODEL` e `EMBEDDING_MODEL`, a API exige `DATABASE_URL`, `FRONTEND_URL`, `CLERK_SECRET_KEY` e `CLERK_ISSUER`; em produção também `CLERK_JWT_KEY`. O próprio `.env.example` descreve cada variável.

```powershell
Copy-Item backend/.env.example backend/.env
```

5. Com as dependências do backend instaladas, subir o PostgreSQL (`backend/docker-compose.yml`), aplicar as migrações e iniciar a API:

```powershell
Set-Location backend
docker compose up -d postgres
npm run migrate:deploy
npm run start:dev
```

Em outro terminal, testar a API:

```powershell
Invoke-RestMethod http://localhost:3001/api/health
```

`OLLAMA_URL` pode apontar para um host Ollama acessível ao backend. Se frontend, API e Ollama estiverem em máquinas/containers diferentes, `localhost` aponta para a própria máquina/container; configurar o endereço de rede correto e permitir somente acesso confiável. Não expor a API Ollama (`11434`) diretamente à internet.

## 6. Critérios de aceite

- Cada página carrega e altera somente dados do usuário autenticado; uma alteração aparece nas demais páginas após recarregar.
- Home mostra vendas do dia/semana, lista produtos e registra uma venda com preço e custo corretos e snapshot histórico.
- Vendas permite filtrar por intervalo, editar e excluir; vendas antigas continuam inteligíveis depois que um produto é editado ou apagado.
- Dashboard apresenta meta, vendido, restante, série das últimas oito semanas (incluindo semanas zeradas) e semana de maior faturamento correta.
- Dashboard apresenta, por ano ou por mês, o produto que mais vendeu, a média de vendas, o dia da semana e a semana do mês que mais vendem e o lucro mensal × anual, calculados com o preço e o custo gravados em cada venda; editar ou excluir um produto não muda o lucro de vendas passadas.
- Chat usa catálogo e vendas persistidos, responde com `reply` no contrato definido e o botão Stop interrompe a geração no frontend e a chamada em andamento ao Ollama.
- O backend valida JWT, entrada, propriedade dos recursos e erros; `GET /api/health` não revela configuração sensível.
