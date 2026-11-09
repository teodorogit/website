/** Cosine similarity of two vectors of the same dimension; 0 when either is the zero vector. */
export function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
    if (left.length !== right.length) {
        throw new RangeError(`Embedding dimensions differ: ${left.length} vs ${right.length}`);
    }

    let dotProduct = 0;
    let leftMagnitude = 0;
    let rightMagnitude = 0;

    for (let index = 0; index < left.length; index += 1) {
        const leftValue = left[index]!;
        const rightValue = right[index]!;
        dotProduct += leftValue * rightValue;
        leftMagnitude += leftValue * leftValue;
        rightMagnitude += rightValue * rightValue;
    }

    if (leftMagnitude === 0 || rightMagnitude === 0) {
        return 0;
    }

    return dotProduct / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}
