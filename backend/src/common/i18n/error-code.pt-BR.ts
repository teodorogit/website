import { ErrorCode } from '../errors/error-code';

const errorCodePtBr: Record<ErrorCode, string> = {
    BAD_REQUEST: 'Requisição inválida.',
    VALIDATION_ERROR: 'Revise os campos enviados.',
    UNAUTHORIZED: 'Autenticação necessária.',
    FORBIDDEN: 'Você não tem permissão para realizar esta ação.',
    NOT_FOUND: 'Recurso não encontrado.',
    CONFLICT: 'O recurso entra em conflito com um registro existente.',
    PAYLOAD_TOO_LARGE: 'O corpo da requisição é grande demais.',
    TOO_MANY_REQUESTS: 'Muitas requisições. Tente novamente em instantes.',
    INTERNAL_SERVER_ERROR: 'Ocorreu um erro inesperado.',
    BAD_GATEWAY: 'Um serviço externo falhou ao responder.',
    SERVICE_UNAVAILABLE: 'Serviço temporariamente indisponível.',

    INVALID_CURSOR: 'Cursor de paginação inválido.',

    PRODUCT_NOT_FOUND: 'Produto não encontrado.',
    PRODUCT_NAME_CONFLICT: 'Já existe um produto com este nome.',
    PRODUCT_LIMIT_REACHED: 'Você atingiu o limite de produtos cadastrados. Remova um produto para cadastrar outro.',

    SALE_NOT_FOUND: 'Venda não encontrada.',
    INVALID_DATE_RANGE: 'A data inicial deve ser anterior ou igual à data final.',
    SALE_FILTER_CONFLICT: 'Use o filtro "date" ou o intervalo "startDate"/"endDate", não ambos.',

    CHAT_LAST_MESSAGE_NOT_USER: 'A última mensagem da conversa deve ser do usuário.',
    LLM_UNAVAILABLE: 'O assistente está indisponível no momento. Tente novamente em instantes.',
    LLM_INVALID_RESPONSE: 'O assistente retornou uma resposta inválida.',
};

export default errorCodePtBr;
