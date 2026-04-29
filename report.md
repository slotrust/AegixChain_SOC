# AegisX Cyber Security SOC

## Domain & Summary 
AegisX is a security operations center web application built to monitor, detect, and automatically block malicious activities in real-time.

## The Problem
Modern applications face automated attacks...

## Key Findings
1. The IPS successfully blocks brute force attempts internally.
2. When testing from an external Python script, Google AI Studio proxy serves an HTML Cookie Challenge before reaching the backend API. So the attacker script receives Status 200 (for the challenge page), not the backend response, thwarting the attack entirely at the infrastructure layer.