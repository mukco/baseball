import matplotlib.pyplot as plt
import numpy as np

# Simulate pitch trajectory data for various pitch types
np.random.seed(42)

# Define pitch types and their typical movement patterns (simplified)
pitch_types = {
    "4-Seam Fastball": {"color": "red", "vx": np.random.normal(0, 0.5, 10), "vy": np.linspace(0, -18, 10)},
    "Sinker": {"color": "blue", "vx": np.random.normal(0, 0.3, 10), "vy": np.linspace(0, -20, 10)},
    "Slider": {"color": "green", "vx": np.linspace(-1.5, -3, 10), "vy": np.linspace(0, -14, 10)},
    "Curveball": {"color": "purple", "vx": np.linspace(0.2, -0.8, 10), "vy": np.linspace(0, -12, 10)},
    "Changeup": {"color": "orange", "vx": np.random.normal(0, 0.4, 10), "vy": np.linspace(0, -16, 10)}
}

# Create the plot
plt.figure(figsize=(10, 6))
for pitch, data in pitch_types.items():
    x = np.cumsum(data["vx"])
    y = data["vy"]
    plt.plot(x, y, label=pitch, color=data["color"], linewidth=2)

plt.gca().invert_yaxis()  # Invert to represent pitch going downward
plt.title("Simulated Pitch Trajectories by Pitch Type")
plt.xlabel("Horizontal Movement (inches)")
plt.ylabel("Vertical Drop (inches)")
plt.legend()
plt.grid(True)
plt.tight_layout()

plt.show()
