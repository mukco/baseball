import torch
import csv
import pdb
import numpy as np
from torch import nn
from torch.utils.data import DataLoader, TensorDataset, RandomSampler
import matplotlib.pyplot as plt
from matplotlib.font_manager import FontProperties
from matplotlib.patches import Patch
from matplotlib.lines import Line2D
import sys

device = (
    "cuda"
    if torch.cuda.is_available()
    else "mps" if torch.backends.mps.is_available() else "cpu"
)

dataloader = None
test_data_loader = None
dataset = None
train_data_set = None

row_index = [
    "release_speed",
    "release_pos_x",
    "release_pos_z",
    "pfx_x",
    "pfx_z",
    "plate_x",
    "plate_z",
    "vx0",
    "vy0",
    # "vz0",
    "ax",
    "ay",
    # "az",
    "sz_top",
    "sz_bot",
    "effective_speed",
    "release_spin_rate",
    "release_extension",
    "release_pos_y",
    "spin_axis",
    "api_break_z_with_gravity",
    "api_break_x_arm",
    # "api_break_x_batter_in",
    "arm_angle",
    "pitch_name",
]


pitch_type_index = {
    "4-Seam Fastball": 0,
    "Sweeper": 1,
    "Sinker": 2,
    "Slider": 3,
    "Cutter": 4,
    "Curveball": 5,
    "Split-Finger": 6,
    "Knuckle Curve": 7,
    "Changeup": 8,
    "Screwball": 9,
    "Knuckleball": 10,
    "Slurve": 11,
}

balance_count = [0 for _ in range(len(pitch_type_index))]

# DATA PREPEARATION AND PREPROCESSING
with open(f"{sys.argv[3]}.csv", newline="") as base_ball_data:
    reader = csv.reader(base_ball_data)
    data = list(reader)

    processed_pitch_data_labels = []
    processed_pitch_data = []
    headers = data[0]

    for full_row in data[1:]:
        row = []

        for _, row_value in enumerate(row_index):
            row.append(full_row[headers.index(row_value)])

        pitch = row[-1]

        # Ghetto way to balance the data
        if balance_count[pitch_type_index[pitch]] > 500:
            continue
        balance_count[pitch_type_index[pitch]] += 1

        features = []

        for i, datum in enumerate(row[:-1]):
            try:
                if datum == "":
                    datum = 0.0
                features.append(float(datum))
            except ValueError:
                pdb.set_trace()
                print("Error parsing data")

        labels = [0 for _i in range(len(pitch_type_index))]
        labels[pitch_type_index[pitch]] = 1

        processed_pitch_data.append(features)
        processed_pitch_data_labels.append(labels)

    features_tensor = torch.tensor(processed_pitch_data, dtype=torch.float32)
    labels_tensor = torch.tensor(processed_pitch_data_labels, dtype=torch.float32)

    features_tensor_min = features_tensor.min(axis=0).values
    features_tensor_max = features_tensor.max(axis=0).values
    features_tensor = (
        2
        * (features_tensor - features_tensor_min)
        / (features_tensor_max - features_tensor_min)
        - 1
    )
    dataset = TensorDataset(features_tensor, labels_tensor)
    # Split the dataset into training and testing sets
    train_size = int(0.8 * len(dataset))
    test_size = len(dataset) - train_size

    train_data_set, test_dataset = torch.utils.data.random_split(
        dataset, [train_size, test_size]
    )

    dataloader = DataLoader(
        train_data_set, shuffle=RandomSampler(train_data_set), batch_size=100
    )
    test_data_loader = DataLoader(test_dataset, shuffle=True)

feature_size = len(processed_pitch_data[0])


class NeuralNetwork(nn.Module):

    def __init__(self, neuronsm, output_size):
        super().__init__()
        self.flatten = nn.Flatten()
        self.linear_relu_stack = nn.Sequential(
            nn.Linear(feature_size, neurons),
            nn.ReLU(),
            nn.Dropout(p=0.5),
            nn.Linear(neurons, neurons),
            nn.ReLU(),
            nn.Dropout(p=0.5),
            nn.Linear(neurons, neurons),
            nn.ReLU(),
            nn.Dropout(p=0.5),
            nn.Linear(neurons, output_size),
        )

    def forward(self, x):
        x = self.flatten(x)
        logits = self.linear_relu_stack(x)
        logits = nn.functional.softmax(logits, dim=1)
        return logits


neurons = int(sys.argv[1]) if len(sys.argv) > 1 else 128
output_size = len(pitch_type_index)

model = NeuralNetwork(neurons, output_size).to(device)
loss_fn = nn.CrossEntropyLoss()
optimizer = torch.optim.SGD(model.parameters(), lr=100e-3)


def train(dataloader, model, loss_fn, optimizer):
    model.train()
    # Remember whenever you use DataLoader it will load the data in batches.
    # so here X is (batch_size, 26) and y is (batch_size, 10)
    for batch, (X, y) in enumerate(dataloader):
        X, y = X.to(device), y.to(device)
        # Compute prediction error
        pred = model(X)
        loss = loss_fn(pred, y)

        # Backpropagation
        loss.backward()
        optimizer.step()
        optimizer.zero_grad()

        # print(f"loss: {loss:>7f}  current batch: [{(batch + 1):>5d}]")


def test(dataloader, model, loss_fn):
    size = len(dataloader.dataset)
    num_batches = len(dataloader)
    model.eval()
    test_loss, correct = 0, 0
    with torch.no_grad():
        for X, y in dataloader:
            X, y = X.to(device), y.to(device)
            pred = model(X)
            test_loss += loss_fn(pred, y).item()
            correct += (pred.argmax(1) == y.argmax(1)).type(torch.float).sum().item()
    test_loss /= num_batches
    correct /= size
    print(f"Test Error: \n Accuracy: {(100*correct):>0.1f}%, Avg loss: {test_loss:>8f}")


epochs = int(sys.argv[2]) if len(sys.argv) > 1 else 5
for t in range(epochs):
    print(f"Epoch {t+1}\n-------------------------------")
    train(dataloader, model, loss_fn, optimizer)
    test(test_data_loader, model, loss_fn)
print("Done!")

classes = [
    "4-Seam Fastball",
    "Sweeper",
    "Sinker",
    "Slider",
    "Cutter",
    "Curveball",
    "Split-Finger",
    "Knuckle Curve",
    "Changeup",
    "Screwball",
    "Knuckleball",
    "Slurve",
]

test_results = []
default_headers = ["predicted", "actual", "correct"]
optional_headers = ["plate_x", "plate_z", "release_speed"]
headers = default_headers + optional_headers

fig, ax = plt.subplots()
fig2, ax2 = plt.subplots()

model.eval()
with torch.no_grad():
    for x, y in test_data_loader:
        x = x.to(device)
        pred = model(x)
        predicted, actual = classes[pred.argmax(1)], classes[y.argmax(1)]
        test_results.append([predicted, actual, predicted == actual])
        for _, key in enumerate(optional_headers):
            test_results[-1].append(round(x[0][row_index.index(key)].item(), 2))

with open(f"results_{neurons}_{epochs}_{sys.argv[3]}.csv", "w", newline="") as f:
    writer = csv.writer(f)
    writer.writerow(headers)
    writer.writerows(test_results)
    bar_correct_results = [0 for _ in range(len(classes))]
    incorrect_bar_results = [0 for _ in range(len(classes))]

    for result in test_results:
        if result[headers.index("correct")]:
            bar_correct_results[classes.index(result[headers.index("actual")])] += 1
        else:
            incorrect_bar_results[classes.index(result[headers.index("actual")])] += 1

    results = {
        "correct": bar_correct_results,
        "incorrect": incorrect_bar_results,
    }

    for result, count in results.items():
        font = FontProperties(size=4)
        bar = ax2.bar(
            classes,
            count,
            label=result,
            color="blue" if result == "correct" else "red",
            bottom=0 if result == "correct" else bar_correct_results,
        )
        ax2.bar_label(bar, label_type="center")
        ax2.set_xticklabels(classes, rotation=45, ha="right")
        legend_elements = [
            Patch(facecolor="red", label="incorrect"),
            Patch(facecolor="blue", label="correct"),
        ]
        ax2.legend(handles=legend_elements)

    for result in test_results:
        ax.plot(
            result[headers.index("plate_x")],
            result[headers.index("plate_z")],
            f'{"-o" if result[headers.index("correct")] else "-o"}',
            color="blue" if result[headers.index("correct")] else "red",
            linewidth=1,
        )
        legend_elements = [
            Line2D(
                [0],
                [0],
                marker="o",
                color="w",
                markerfacecolor="red",
                markersize=10,
                label="incorrect",
            ),
            Line2D(
                [0],
                [0],
                marker="o",
                color="w",
                markerfacecolor="blue",
                markersize=10,
                label="correct",
            ),
        ]
        ax.legend(handles=legend_elements)

plt.ylabel("y")
plt.xlabel("x")
plt.show()
