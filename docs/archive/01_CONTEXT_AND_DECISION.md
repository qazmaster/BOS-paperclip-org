# 01 - Context and Decision

> **Historical context:** This document records the original decision to build BOS Light instead of porting the full BOS Chimera 4.1 kernel. The active operating model is the **BOS Light v1.4.1 package**. This file remains useful for provenance, but v1.4.1 controls active ownership, permission, and trust-boundary guidance.

## Background

BOS Chimera 4.1 was originally a broad organizational operating system specification. It included a full kernel, event ledger, policy engine, workorder state machine, cryptographic signatures, zero-trust grants, memory sync, RUSH preemption, and many other infrastructure concepts.

The current decision is to adapt BOS to Paperclip by preserving the organizational intelligence and discarding infrastructure that Paperclip already provides.

## Decision

Build **BOS Light** for Paperclip.

BOS Light is not:

- a kernel;
- a runtime;
- a policy engine;
- an event sourcing layer;
- a replacement database;
- a second task system;
- a replacement governance layer.

BOS Light is:

- a Paperclip company template;
- a set of 7 semantic division agents;
- hat profiles and VFP definitions;
- BPI prioritization;
- Product Blueprint generation;
- Betting Table batch governance UI;
- lightweight Eval Gates;
- Circuit Breaker safety loop;
- Div7 decision protocol.

## Why this decision preserves time to market

Full BOS Kernel would require building and maintaining a second orchestration layer next to Paperclip. That creates duplicate state, duplicate governance, duplicated event lifecycle and a large integration surface.

BOS Light uses Paperclip's existing execution plane. The first deliverable is a company template that works without plugin runtime. The plugin is a thin adapter that can be adjusted if Paperclip APIs change.

## What is preserved from BOS Chimera

- 7-Division Org Board.
- Hat profiles: roles, VFP, guardrails.
- BPI scoring.
- Betting Table for batch approval.
- Product Blueprint, reduced to 5 mandatory sections.
- Circuit Breaker with Closed / Half-Open / Open.
- Eval Gate Matrix, reduced to 3-4 gates.
- Div7 Decision Protocol: Cynefin + OODA.

## What is discarded for MVP

- Ed25519 internal event signatures.
- Hash chain event ledger.
- Full kernel packages.
- 26-state WorkOrder machine.
- Airgap Knowledge Flow.
- RUSH checkpoint/freeze/resume.
- Four Budget Grant types and separate spend ledger.
- Memory Sync Protocol as a separate subsystem.

## Golden rule

Paperclip gives the rails. BOS gives the operating doctrine.

The active repo-local contract set is captured by R012–R016, and the organization/runtime posture decisions are D012–D014. Those records are the source of truth for the v1.4.1 remap, the Div6-only external boundary, Div5 evidence quarantine, Div1 routing ownership, and conservative runtime claims.
