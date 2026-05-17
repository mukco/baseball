/**
 * Compute total trainable parameter count for a densely-connected MLP.
 *
 * Each layer contributes (prevSize + 1) * layerSize parameters
 * (weights + one bias per neuron). The +1 accounts for the bias term.
 *
 * @param {number} inputSize  - Number of input features
 * @param {Array<{neurons: number}>} layers - Hidden layer config
 * @param {number} outputSize - Number of output neurons
 * @returns {number} Total parameter count
 */
export function calcNNParams(inputSize, layers, outputSize) {
  let total = 0
  let prev = inputSize
  for (const l of layers) {
    total += (prev + 1) * l.neurons
    prev = l.neurons
  }
  total += (prev + 1) * outputSize
  return total
}
