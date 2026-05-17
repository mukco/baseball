// Educational drawer: explains neural networks, parameters, task types, and hyperparameters.

const sections = [
  {
    title: 'What is a neural network?',
    content: `A neural network is a series of layers, each containing neurons. Every neuron takes a weighted sum of its inputs, adds a bias, and passes the result through an activation function. During training the network learns the right weights by comparing its predictions to the true answers and working backwards to adjust them — this is called backpropagation.

The result is a model that can approximate complex, non-linear relationships between your input features and a target outcome — things that a simple formula couldn't capture.`,
  },
  {
    title: 'What is a parameter?',
    content: `A parameter is a number the network learns. Each connection between two neurons is one weight (a parameter), and each neuron also has a bias (another parameter).

For a layer that takes 10 inputs and has 64 neurons: 10 × 64 weights + 64 biases = 704 parameters.

The parameter count you see in the builder is the total across all layers. More parameters = more capacity to learn, but also more data and training time required to avoid overfitting.`,
  },
  {
    title: 'Regression vs. Classification',
    content: `Regression predicts a continuous number — for example, a player's wRC+ next season. The model outputs a single value and is evaluated with R², RMSE, and MAE.

Classification predicts a category. The model outputs a probability for each class and picks the highest one. If your target column is continuous (like ERA), you can use "one-hot encode target" to bucket it into tiers (e.g. elite / above-avg / below-avg / poor) and treat it as a classification problem.`,
  },
  {
    title: 'Activation functions',
    content: `An activation function introduces non-linearity — without it, stacking layers would still just be a linear model.

• ReLU (Rectified Linear Unit): max(0, x). Fast, simple, and works well in most cases. The default.
• Tanh: outputs between -1 and 1. Can help when features are symmetric around zero.
• Sigmoid: outputs between 0 and 1. Rarely used in hidden layers; common in binary output neurons.
• Leaky ReLU: like ReLU but allows a small gradient for negative inputs — can help if neurons "die" during training.`,
  },
  {
    title: 'Overfitting and dropout',
    content: `Overfitting happens when a model memorizes the training data instead of learning general patterns. The sign: training accuracy is high but test accuracy is much lower.

Dropout is a regularization technique that randomly zeros out a fraction of neurons on each training step. This forces the network to learn redundant representations and prevents over-reliance on any single neuron. A dropout of 0.2 means 20% of neurons are randomly silenced per step.`,
  },
  {
    title: 'Random Forest and Gradient Boosting',
    content: `These are tree-based ensemble methods — they don't use neurons, but they're powerful for tabular data like baseball stats.

Random Forest trains many decision trees on random subsets of data and features, then averages their predictions. It's robust and fast.

Gradient Boosting trains trees sequentially, each one correcting the errors of the last. XGBoost is the most famous variant. It often outperforms random forests but is more sensitive to hyperparameters.

Both produce feature importances showing which stats mattered most.`,
  },
]

export default function NNExplainer({ onClose }) {
  return (
    <div className="card p-5 space-y-4 border border-brand/20">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-content-primary">How machine learning models work</h2>
        <button onClick={onClose} className="text-content-muted hover:text-content-primary transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sections.map(s => (
          <div key={s.title} className="space-y-1.5">
            <h3 className="text-sm font-semibold text-brand">{s.title}</h3>
            <p className="text-xs text-content-secondary leading-relaxed whitespace-pre-line">{s.content}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
