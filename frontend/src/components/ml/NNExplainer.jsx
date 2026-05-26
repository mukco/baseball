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
  {
    title: 'Features (X) and target (y)',
    content: `Features (X) are the input columns the model uses to make its prediction — e.g. woba, fb_pct, slg. Target (y) is what you're predicting — e.g. hr.

Hyperparameters are settings you choose before training: learning rate, epochs, layer sizes, dropout. These are not learned by the model — they require human judgment. Contrast with model parameters (weights and biases) which are learned automatically during training.

StandardScaler normalizes each feature to mean 0, std 1 so that features on different scales (like ERA and strikeouts) contribute equally. LabelEncoder converts string class labels into integer indices so the model can work with them.`,
  },
  {
    title: 'Why train and test data stay separate',
    content: `The test set simulates the real world — future data the model has never seen. If anything (the scaler, the label encoder) is fit on test data too, you leak information about the test distribution into training and the evaluation is no longer honest.

Training data teaches. Test data grades. If the grader shows you the answers first, the grade means nothing.

The test split slider controls what fraction of rows is held back. 20% is a common default — the model trains on 80% and is evaluated on the remaining 20%.`,
  },
  {
    title: 'How to read regression metrics',
    content: `R² (R-squared) measures how much of the natural spread in the target your model explains. 1.0 is perfect; 0.0 means the model is no better than predicting the average every time; negative means it's actively worse.

MAE (Mean Absolute Error) is the average prediction error in the same units as your target — easy to interpret. If predicting HR totals and MAE is 3.0, you're off by 3 HRs on average.

RMSE (Root Mean Squared Error) squares the errors before averaging, then takes the square root. It amplifies large mistakes more than small ones, so it's always ≥ MAE. A large gap between RMSE and MAE signals a few bad outlier predictions.`,
  },
  {
    title: 'How to read classification metrics',
    content: `Accuracy alone is misleading — a model that predicts "low HR" for everyone can hit 70% accuracy just because most batters are low-HR guys.

Precision: of all the players the model predicted as "31+ HR hitters", how many actually were? Recall: of all actual "31+ HR hitters", how many did the model catch? F1 is the harmonic mean of the two — useful when classes are imbalanced.

The confusion matrix shows where errors are happening class by class. Bright blue diagonal = correct predictions. Red off-diagonal cells = where the model is confused. A model that's 70% accurate but has a blank row for rare classes has learned nothing about those classes.`,
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
