import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.metrics import (
    r2_score, mean_squared_error, mean_absolute_error,
    accuracy_score, f1_score, precision_score, recall_score, confusion_matrix,
)
import time


ACTIVATIONS = {
    "relu":    nn.ReLU,
    "tanh":    nn.Tanh,
    "sigmoid": nn.Sigmoid,
    "leaky_relu": nn.LeakyReLU,
}


class MLP(nn.Module):
    def __init__(self, input_size: int, layers: list[int], output_size: int,
                 activation: str = "relu", dropout: float = 0.0):
        super().__init__()
        act_cls = ACTIVATIONS.get(activation, nn.ReLU)
        blocks = []
        prev = input_size
        for width in layers:
            blocks.append(nn.Linear(prev, width))
            blocks.append(act_cls())
            if dropout > 0:
                blocks.append(nn.Dropout(p=dropout))
            prev = width
        blocks.append(nn.Linear(prev, output_size))
        self.net = nn.Sequential(*blocks)

    def forward(self, x):
        return self.net(x)

    def parameter_count(self) -> int:
        return sum(p.numel() for p in self.parameters())

    def architecture_summary(self, input_size: int, layers: list[int],
                             output_size: int, activation: str) -> str:
        parts = [f"Input({input_size})"]
        for w in layers:
            parts.append(f"Dense({w}, {activation})")
        parts.append(f"Output({output_size})")
        return " → ".join(parts)


def train(
    X_train, X_test, y_train, y_test,
    feature_names: list[str],
    task: str,
    hyperparams: dict,
):
    hp = hyperparams or {}
    layers      = [int(n) for n in hp.get("layers", [64, 32])]
    activation  = hp.get("activation", "relu")
    lr          = float(hp.get("learning_rate", 0.001))
    epochs      = int(hp.get("epochs", 50))
    dropout     = float(hp.get("dropout", 0.0))
    batch_size  = int(hp.get("batch_size", 64))

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train).astype(np.float32)
    X_test_s  = scaler.transform(X_test).astype(np.float32)

    label_encoder = None
    output_size = 1

    if task == "classification":
        label_encoder = LabelEncoder()
        y_train_enc = label_encoder.fit_transform(y_train)
        y_test_enc  = label_encoder.transform(y_test)
        output_size = len(label_encoder.classes_)
        y_train_t = torch.tensor(y_train_enc, dtype=torch.long)
        y_test_t  = torch.tensor(y_test_enc, dtype=torch.long)
        loss_fn   = nn.CrossEntropyLoss()
    else:
        y_train_t = torch.tensor(y_train.astype(np.float32), dtype=torch.float32).unsqueeze(1)
        y_test_t  = torch.tensor(y_test.astype(np.float32), dtype=torch.float32).unsqueeze(1)
        loss_fn   = nn.MSELoss()

    X_train_t = torch.tensor(X_train_s)
    X_test_t  = torch.tensor(X_test_s)

    dataset    = TensorDataset(X_train_t, y_train_t)
    loader     = DataLoader(dataset, batch_size=batch_size, shuffle=True)
    input_size = X_train_s.shape[1]

    model = MLP(input_size, layers, output_size, activation, dropout).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=lr)

    loss_history = []
    t0 = time.time()

    for _ in range(epochs):
        model.train()
        epoch_loss = 0.0
        batches = 0
        for X_batch, y_batch in loader:
            X_batch, y_batch = X_batch.to(device), y_batch.to(device)
            optimizer.zero_grad()
            out  = model(X_batch)
            loss = loss_fn(out, y_batch)
            loss.backward()
            optimizer.step()
            epoch_loss += loss.item()
            batches += 1
        loss_history.append(round(epoch_loss / max(batches, 1), 6))

    elapsed_ms = int((time.time() - t0) * 1000)

    model.eval()
    with torch.no_grad():
        logits = model(X_test_t.to(device)).cpu()

    if task == "classification":
        y_pred = logits.argmax(dim=1).numpy()
        labels = label_encoder.classes_
        avg = "binary" if output_size == 2 else "weighted"
        metrics = {
            "accuracy":  round(float(accuracy_score(y_test_enc, y_pred)), 4),
            "f1":        round(float(f1_score(y_test_enc, y_pred, average=avg, zero_division=0)), 4),
            "precision": round(float(precision_score(y_test_enc, y_pred, average=avg, zero_division=0)), 4),
            "recall":    round(float(recall_score(y_test_enc, y_pred, average=avg, zero_division=0)), 4),
        }
        cm = confusion_matrix(y_test_enc, y_pred).tolist()
        cm_labels = [str(l) for l in labels]
        confusion_matrix_out = cm
    else:
        y_pred = logits.squeeze(1).numpy()
        metrics = {
            "r2":   round(float(r2_score(y_test, y_pred)), 4),
            "rmse": round(float(np.sqrt(mean_squared_error(y_test, y_pred))), 4),
            "mae":  round(float(mean_absolute_error(y_test, y_pred)), 4),
        }
        confusion_matrix_out = None
        cm_labels = None

    arch = model.architecture_summary(input_size, layers, output_size, activation)

    return {
        "metrics":            metrics,
        "confusion_matrix":   confusion_matrix_out,
        "confusion_labels":   cm_labels,
        "feature_importance": [],
        "training_time_ms":   elapsed_ms,
        "parameter_count":    model.parameter_count(),
        "architecture":       arch,
        "loss_history":       loss_history,
    }
