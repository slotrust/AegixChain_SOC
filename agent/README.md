# CyberSOC Local Agent

This Python agent monitors system processes and network connections and sends the data to the CyberSOC backend for analysis.

## Prerequisites

- Python 3.x
- `psutil` library
- `requests` library

## Installation

```bash
pip install psutil requests
```

## Running the Agent

```bash
python soc_agent.py
```

## Features

- **Process Monitoring**: Tracks CPU, memory, and executable paths.
- **Network Monitoring**: Tracks established connections and remote IPs.
- **Anomaly Detection**: Flags high CPU usage and suspicious process names.
- **Data Normalization**: Sends data in a standardized JSON format.
