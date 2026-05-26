export const ML_HELP = {
  // ── Metrics ────────────────────────────────────────────────────────────────
  r2: {
    label: 'R² (R-squared)',
    definition: 'How much of the natural variance in the target your model explains.',
    formula: '1 − (residual sum of squares / total sum of squares)',
    interpretation: '1.0 = perfect fit. 0.0 = no better than always predicting the mean. Negative = actively worse than the mean. ≥0.85 is excellent, 0.70–0.84 is good, 0.50–0.69 is moderate.',
  },
  rmse: {
    label: 'RMSE',
    definition: 'Root Mean Squared Error — the typical size of a prediction error, in the same units as the target.',
    formula: '√( mean( (predicted − actual)² ) )',
    interpretation: 'Lower is better. Squaring the errors before averaging means large outlier errors are weighted more heavily than small ones. If RMSE is much larger than MAE, a few bad predictions are dragging it up.',
  },
  mae: {
    label: 'MAE',
    definition: 'Mean Absolute Error — the average magnitude of prediction errors, in the same units as the target.',
    formula: 'mean( |predicted − actual| )',
    interpretation: 'Lower is better. Easier to interpret than RMSE: if predicting HR and MAE is 3, you\'re typically off by about 3 home runs.',
  },
  accuracy: {
    label: 'Accuracy',
    definition: 'The fraction of test rows the model predicted with the correct class label.',
    formula: 'correct predictions / total test rows',
    interpretation: 'Higher is better. Can be misleading when classes are imbalanced — a model that always predicts "low HR" can hit 80% accuracy if most players are low-HR guys. Check F1 too.',
  },
  f1: {
    label: 'F1 Score',
    definition: 'The harmonic mean of precision and recall — a single score that balances both.',
    formula: '2 × (Precision × Recall) / (Precision + Recall)',
    interpretation: 'Higher is better (0–1). More informative than accuracy alone for imbalanced classes. Below 0.60 usually signals the model struggles with minority classes.',
  },
  precision: {
    label: 'Precision',
    definition: 'Of all rows the model labeled as class X, what fraction actually were class X?',
    formula: 'true positives / (true positives + false positives)',
    interpretation: 'Higher is better. Low precision = too many false positives — the model is too eager to predict the positive class.',
  },
  recall: {
    label: 'Recall',
    definition: 'Of all rows that actually belong to class X, what fraction did the model correctly identify?',
    formula: 'true positives / (true positives + false negatives)',
    interpretation: 'Higher is better. Low recall = too many false negatives — the model is missing many true cases.',
  },

  // ── Model types ────────────────────────────────────────────────────────────
  random_forest: {
    label: 'Random Forest',
    definition: 'Trains many decision trees on random subsets of rows and features, then averages their predictions.',
    interpretation: 'Robust, hard to overfit, and fast. Feature importances are reliable. A great first model for any tabular dataset.',
  },
  gradient_boosting: {
    label: 'Gradient Boosting',
    definition: 'Trains trees sequentially — each tree focuses on correcting the errors made by the previous one.',
    interpretation: 'Often more accurate than Random Forest but more sensitive to hyperparameters. Tune learning rate and n_estimators together — lower learning rate needs more trees.',
  },
  neural_network: {
    label: 'Neural Network',
    definition: 'Layers of weighted neurons that learn non-linear transformations of the features via backpropagation.',
    interpretation: 'Most flexible but needs the most data and tuning. Start with 2 hidden layers. Watch the loss curve to judge convergence. Use dropout to reduce overfitting.',
  },
  linear_regression: {
    label: 'Linear Regression',
    definition: 'Fits a weighted sum of the input features to predict a continuous target — the simplest regression model.',
    interpretation: 'Fast, interpretable, and a useful baseline. Assumes a linear relationship. Use L2 (Ridge) regularization if features are correlated.',
  },
  logistic_regression: {
    label: 'Logistic Regression',
    definition: 'A linear model for classification that passes the output through a sigmoid to produce class probabilities.',
    interpretation: 'Fast and interpretable. A strong baseline. Works best when the boundary between classes is roughly linear in feature space.',
  },

  // ── Hyperparameters ────────────────────────────────────────────────────────
  n_estimators: {
    label: 'Trees (n_estimators)',
    definition: 'The number of decision trees in the ensemble.',
    interpretation: 'More trees = more stable but slower. Diminishing returns after ~200 trees. Start at 100 and increase if variance is high.',
  },
  max_depth: {
    label: 'Max depth',
    definition: 'The maximum number of levels a single tree is allowed to grow.',
    interpretation: 'Deeper trees capture more complex patterns but are more prone to overfitting. For Random Forest, unlimited depth (blank) is common. For Gradient Boosting, keep it shallow (3–6).',
  },
  learning_rate: {
    label: 'Learning rate',
    definition: 'How large each update step is — for Gradient Boosting, how much each tree contributes; for Neural Networks, how fast weights are adjusted.',
    interpretation: 'Too high = unstable training. Too low = very slow. For Gradient Boosting: lower rate needs more trees (trade-off). For Neural Networks: 0.001 is a safe start.',
  },
  epochs: {
    label: 'Epochs',
    definition: 'One epoch is one complete pass through all training rows. The network updates its weights after each batch.',
    interpretation: 'Watch the loss curve — if it flattens early, more epochs won\'t help (but a higher learning rate might). If loss is still falling at the end, add epochs.',
  },
  dropout: {
    label: 'Dropout',
    definition: 'During each training step, randomly silences this fraction of neurons so they contribute nothing to that pass.',
    interpretation: '0 = disabled. 0.2 means 20% of neurons are randomly dropped per step, forcing the network to learn redundant paths and reducing overfitting. Start at 0.2–0.3.',
  },
  activation: {
    label: 'Activation function',
    definition: 'The non-linear function applied to each neuron\'s output — without it, stacking layers would just be a linear model.',
    interpretation: 'ReLU (max(0, x)) is the default for most tasks: fast and effective. Tanh is useful when features are symmetric around zero. Leaky ReLU helps if neurons "die" during training.',
  },
  regularization: {
    label: 'Regularization',
    definition: 'A penalty added to the loss function to discourage large weights, reducing overfitting.',
    interpretation: 'L2 (Ridge) shrinks all weights evenly — good default. L1 (Lasso) drives some weights to exactly zero, effectively removing features. None is fine if your data is large.',
  },
  c_param: {
    label: 'C (inverse regularization)',
    definition: 'Controls the strength of regularization in Logistic Regression — it\'s the inverse of regularization strength.',
    interpretation: 'Smaller C = stronger regularization = simpler, more generalized model. Larger C = weaker regularization = closer fit to training data. Start at 1.0.',
  },

  // ── Concepts ───────────────────────────────────────────────────────────────
  test_split: {
    label: 'Test split',
    definition: 'The fraction of rows held out from training and used only to evaluate the final model.',
    interpretation: '20% is the standard default. The model never sees this data during training, so evaluation on it honestly simulates performance on future unseen data.',
  },
  one_hot: {
    label: 'Bin target into classes',
    definition: 'Converts a continuous target column (like HR count) into discrete buckets of equal frequency.',
    interpretation: 'Use when you want to classify into tiers (elite / above-avg / below-avg / poor) rather than predict an exact number. 4 bins is a good default.',
  },
  feature_importance: {
    label: 'Feature importance',
    definition: 'A measure of how much each input feature influenced the model\'s predictions.',
    interpretation: 'Higher = more influential. Tree-based models compute this natively from split gain. Neural networks estimate it via permutation (shuffling a feature and measuring accuracy drop).',
  },
  training_loss: {
    label: 'Training loss',
    definition: 'The error the network measures on training data at the end of each epoch.',
    interpretation: 'Should decrease and flatten. Rapid early drop then plateau = normal. Still dropping at final epoch = try more epochs. Oscillating = lower the learning rate.',
  },
  residuals: {
    label: 'Residuals distribution',
    definition: 'Each bar is a bucket of residual values (predicted − actual). A residual of 0 means the model was exactly right for that row.',
    formula: 'residual = predicted − actual',
    interpretation: 'A symmetric bell centred on 0 = errors are random and unbiased — the model isn\'t systematically over- or under-predicting. A skewed distribution or a peak far from 0 means the model has a consistent bias in one direction. Heavy tails mean a few predictions are very wrong.',
  },
}
