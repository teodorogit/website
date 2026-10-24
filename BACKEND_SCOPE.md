# Escopo do backend

Documento de implementação para o backend real do sistema. O frontend atual usa repositórios locais e dados de demonstração; as rotas abaixo definem o contrato para substituí-los por uma API persistente.

## 1. Convenções da API

- Prefixo: `/api`; versão inicial sem versionamento explícito.
- Formato: JSON UTF-8. Valores monetários são enviados em reais como números decimais na API e armazenados como centavos inteiros no banco.
- Datas de calendário: `YYYY-MM-DD`. Datas e horas persistidas: `timestamptz`; interpretar datas e agrupar semanas no fuso horário do usuário, inicialmente `America/Sao_Paulo`.
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

Usar `400` para entrada inválida, `401` sem autenticação, `403` sem permissão, `404` para recurso inexistente do usuário, `409` para conflito e `500` para falha inesperada. Nunca retornar stack trace, segredo ou prompt interno.

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

Lista as vendas da data local selecionada pela Home. Deve incluir `productName` e `unitPrice` salvos na venda para manter o histórico, mesmo que o produto mude ou seja removido.

Resposta `200`:

```json
{
  "items": [
    {
      "id": "uuid",
      "productId": "uuid",
      "productName": "Brigadeiro",
      "unitPrice": 3.0,
      "quantity": 2,
      "total": 6.0,
      "date": "2026-10-24",
      "time": "12:30"
    }
  ]
}
```

#### `GET /api/sales?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`

Mesma rota para o histórico da página Vendas. Datas são inclusivas; aceitar somente um limite também. Validar que `startDate <= endDate`; ordenar por data e hora decrescentes. Sem filtros, retornar todas as vendas paginadas (ver seção de paginação).

#### `POST /api/sales`

Registra uma venda usando o preço atual do produto no backend, sem confiar em preço ou nome enviados pelo navegador.

Corpo:

```json
{ "productId": "uuid", "quantity": 2, "date": "2026-10-24" }
```

Validar produto pertencente ao usuário, `quantity` inteiro positivo e data válida. Criar a venda e capturar nome e preço unitário do produto na mesma transação.

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

Na Home, o total diário/semanal, custo de preparação e lucro podem ser derivados dos registros de venda e produtos retornados, como no protótipo. Alternativamente, retorná-los em um resumo, desde que use o mesmo fuso e os mesmos valores históricos.

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

### Vendas (`/sales`)

Além dos `GET` e `POST /api/sales` descritos na Home:

#### `PATCH /api/sales/:id`

Atualiza produto, quantidade e/ou data de uma venda. Corpo parcial com campos permitidos: `{ "productId": "uuid", "quantity": 3, "date": "2026-10-23" }`. Se trocar o produto, atualizar juntos o vínculo, nome e preço histórico a partir do catálogo atual. Para venda histórica cujo produto foi apagado, permitir manter o snapshot sem vínculo. Resposta `200` com a venda atualizada.

#### `DELETE /api/sales/:id`

Exclui somente venda pertencente ao usuário autenticado. Resposta `204`; `404` se não existir ou não pertencer ao usuário.

### Produtos (`/products`)

Além de `GET /api/products` descrito na Home:

#### `POST /api/products`

Corpo: `{ "name": "Brownie", "price": 8.0, "preparationCost": 2.5 }`.

Validar nome não vazio (máximo 32 caracteres, conforme formulário), preço maior que zero, custo maior ou igual a zero, ambos finitos e com no máximo duas casas decimais. Resposta `201` com o produto criado.

#### `PATCH /api/products/:id`

Atualiza `name`, `price` e/ou `preparationCost` com as mesmas validações. Alterar preço não altera o preço histórico de vendas passadas. Resposta `200` com o produto atualizado.

#### `DELETE /api/products/:id`

Remove o produto do catálogo do usuário. As vendas existentes devem continuar consultáveis com seus dados de snapshot; definir `sales.product_id` como `NULL` em vez de apagar vendas. Resposta `204`.

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

Aceitar até 20 mensagens, papéis `user` e `assistant`, conteúdo não vazio de até 4.000 caracteres, e exigir que a última mensagem seja do usuário. Não aceitar mensagens de sistema enviadas pelo cliente.

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

Ao criar ou editar uma venda, validar que `product_id` pertence ao mesmo `user_id`. Uma FK simples garante que o produto existe, mas a propriedade deve ser conferida na camada de serviço ou reforçada pelo desenho do banco. Na exclusão de produto, manter `product_name_snapshot` e `unit_price_cents`; não apagar registros de venda.

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

4. Configurar o arquivo local `backend/.env` (não versionar segredos):

```env
PORT=3001
OLLAMA_URL=http://localhost:11434
CHAT_MODEL=llama3.2
EMBEDDING_MODEL=embeddinggemma
```

5. Com as dependências do backend instaladas, iniciar a API:

```powershell
Set-Location backend
npm run dev
```

Em outro terminal, testar a API:

```powershell
Invoke-RestMethod http://localhost:3001/api/health
```

`OLLAMA_URL` pode apontar para um host Ollama acessível ao backend. Se frontend, API e Ollama estiverem em máquinas/containers diferentes, `localhost` aponta para a própria máquina/container; configurar o endereço de rede correto e permitir somente acesso confiável. Não expor a API Ollama (`11434`) diretamente à internet.

## 6. Critérios de aceite

- Cada página carrega e altera somente dados do usuário autenticado; uma alteração aparece nas demais páginas após recarregar.
- Home mostra vendas do dia/semana, lista produtos e registra uma venda com preço correto e snapshot histórico.
- Vendas permite filtrar por intervalo, editar e excluir; vendas antigas continuam inteligíveis depois que um produto é editado ou apagado.
- Dashboard apresenta meta, vendido, restante, série das últimas oito semanas (incluindo semanas zeradas) e semana de maior faturamento correta.
- Chat usa catálogo e vendas persistidos, responde com `reply` no contrato definido e o botão Stop interrompe a geração no frontend e a chamada em andamento ao Ollama.
- O backend valida JWT, entrada, propriedade dos recursos e erros; `GET /api/health` não revela configuração sensível.
