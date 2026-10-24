import { products, type Product } from '../data/products.js'
import { createEmbeddings } from './llm.js'

type EmbeddedProduct = {
  product: Product
  embedding: number[]
}

let productEmbeddings: Promise<EmbeddedProduct[]> | undefined

const productText = (product: Product): string => (
  `${product.name}. Categoria: ${product.category}. ${product.description} Preço: R$ ${product.price.toFixed(2)}.`
)

const getProductEmbeddings = (): Promise<EmbeddedProduct[]> => {
  if (!productEmbeddings) {
    productEmbeddings = createEmbeddings(products.map(productText))
      .then((embeddings) => embeddings.map((embedding, index) => {
        if (!embedding.length || embedding.some((value) => !Number.isFinite(value))) {
          throw new Error('Ollama retornou um vetor de embedding inválido.')
        }

        return { product: products[index]!, embedding }
      }))
      .catch((error: unknown) => {
        productEmbeddings = undefined
        throw error
      })
  }

  return productEmbeddings
}

const cosineSimilarity = (left: number[], right: number[]): number => {
  if (left.length !== right.length) {
    throw new Error('Os embeddings retornados pelo Ollama têm dimensões incompatíveis.')
  }

  let dotProduct = 0
  let leftMagnitude = 0
  let rightMagnitude = 0

  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index]!
    const rightValue = right[index]!
    dotProduct += leftValue * rightValue
    leftMagnitude += leftValue ** 2
    rightMagnitude += rightValue ** 2
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0
  }

  return dotProduct / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude))
}

export const findRelevantProducts = async (query: string, limit = 3): Promise<Product[]> => {
  const [queryEmbedding] = await createEmbeddings([query])
  if (!queryEmbedding?.length || queryEmbedding.some((value) => !Number.isFinite(value))) {
    throw new Error('Ollama retornou um embedding inválido para a pergunta.')
  }

  const embeddedProducts = await getProductEmbeddings()

  return embeddedProducts
    .map(({ product, embedding }) => ({
      product,
      similarity: cosineSimilarity(queryEmbedding, embedding),
    }))
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, limit)
    .map(({ product }) => product)
}
