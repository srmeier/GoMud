# GoMud

## Overview

![image](feature-screenshots/splash.png)

**GoMud** is an open-source MUD (_Multi-User Dungeon_) game server and library, written in Go.

It includes a fully playable default world, and provides built-in tools to customize or create your own.

Playable online demo: **http://www.gomud.net**

---

<!-- TOC -->
- [Features](#features)
  - [Screenshots](#screenshots)
  - [ANSI Colors](#ansi-colors)
  - [Small Feature Demos](#small-feature-demos)
- [Setup](#setup)
  - [Requirements](#requirements)
  - [Usage](#usage)
- [Connecting](#connecting)
- [User Support](#user-support)
- [Development Notes](#development-notes)
  - [Contributor Guide](#contributor-guide)
  - [Build Commands](#build-commands)
  - [Env Vars](#env-vars)
  - [Why Go?](#why-go)

---

<!-- /TOC -->

## Features

### Screenshots

Click below to see in-game screenshots of just a handful of features:

[![Feature Screenshots](feature-screenshots/screenshots-thumb.png "Feature Screenshots")](feature-screenshots/README.md)

### ANSI Colors

Colorization is handled through extensive use of my [github.com/GoMudEngine/ansitags](https://github.com/GoMudEngine/ansitags) library.

### Small Feature Demos

- [Auto-complete input](https://youtu.be/7sG-FFHdhtI)
- [In-game maps](https://youtu.be/navCCH-mz_8)
- [Quests / Quest Progress](https://youtu.be/3zIClk3ewTU)
- [Lockpicking](https://youtu.be/-zgw99oI0XY)
- [Hired Mercs](https://youtu.be/semi97yokZE)
- [TinyMap](https://www.youtube.com/watch?v=VLNF5oM4pWw) (okay not much of a "feature")
- [256 Color/xterm](https://www.youtube.com/watch?v=gGSrLwdVZZQ)
- [Customizable Prompts](https://www.youtube.com/watch?v=MFkmjSTL0Ds)
- [Mob/NPC Scripting](https://www.youtube.com/watch?v=li2k1N4p74o)
- [Room Scripting](https://www.youtube.com/watch?v=n1qNUjhyOqg)
- [Kill Stats](https://www.youtube.com/watch?v=4aXs8JNj5Cc)
- [Searchable Inventory](https://www.youtube.com/watch?v=iDUbdeR2BUg)
- [Day/Night Cycles](https://www.youtube.com/watch?v=CiEbOp244cw)
- [Web Socket "Virtual Terminal"](https://www.youtube.com/watch?v=L-qtybXO4aw)
- [Alternate Characters](https://www.youtube.com/watch?v=VERF2l70W34)

---

## Setup

### Requirements

- `go` language runtime installed

- `docker` to build/run as a container (optional)

### Usage

In a Terminal, run one of the following commands:

```shell
make run          # runs GoMud using the `go` framework

make build        # creates a executable binary of GoMud at `./go-mud-server`

make docker-run   # runs GoMud in a container using Docker Compose

make help         # shows all available `make` command options
```

---

## Connecting

When the GoMud server is running, you can connect it via the Terminal, or with a web browser:

- Telnet: `localhost:33333` or `localhost:44444`
- Local-only telnet port: `127.0.0.1:9999`

- Web client: [http://localhost/webclient](http://localhost/webclient)
- Web admin: [http://localhost/admin/](http://localhost/admin/)

Default seeded credentials in the bundled world:

- Username: `admin`
- Password: `password`

---

## User Support

If you have comments, questions, suggestions (don't be shy, your questions or requests might help others too):

- [Github Discussions](https://github.com/GoMudEngine/GoMud/discussions)

- [Discord Server](https://discord.gg/cjukKvQWyy)

- [Community Guides](_datafiles/guides/README.md)

---

## Development Notes

### Contributor Guide

Interested in contributing? Check out our [CONTRIBUTING.md](https://github.com/GoMudEngine/GoMud/blob/master/.github/CONTRIBUTING.md) to learn about the process.

### Build Commands

| Command            | Description                                                                 |
|--------------------|-----------------------------------------------------------------------------|
| `make build`       | Validates and builds the server binary.                                     |
| `make run`         | Generates module imports and starts the server with `go run .`.             |
| `make run-docker`  | Builds and starts the Docker environment from `compose.yml`.                |
| `make test`        | Runs code generation, JavaScript linting, and `go test -race ./...`.        |
| `make validate`    | Runs `fmtcheck` and `go vet`.                                               |
| `make ci-local`    | Builds the local CI container and runs workflow validation.                 |
| `make help`        | Lists the available developer targets.                                      |

### Env Vars

When running, several environment variables can be set to alter behaviors of the mud:

| Variable      | Example Value                   | Descripton                           |
|---------------|---------------------------------|--------------------------------------|
| `CONFIG_PATH` | `/path/to/config.yaml`          | Use alternate config file            |
| `LOG_PATH`    | `/path/to/log.txt`              | Log to file instead of stderr        |
| `LOG_LEVEL`   | `LOW` / `MEDIUM` / `HIGH`       | Set verbosity (rotates at 100MB)     |
| `LOG_NOCOLOR` | `1`                             | Disable colored log output           |

### Why Go?

Why not?

Go provides a number of practical benefits:

- **Compatible**: Easily builds across platforms and CPU architectures (Windows, Linux, MacOS, etc).
- **Fast**: Execution and build times are quick, and GoMud builds in just a couple of seconds.
- **Opinionated**: Consistent style/patterns make it easy to jump into any Go project.
- **Modern**: A relatively new language without decades of accumulated baggage.
- **Upgradable**: Strong backward compatibility makes version upgrades simple and low-risk.
- **Statically linked**: Built binaries have no dependency headaches.
- **No central registries**: Dependencies are pulled directly from source repositories.
- **Concurrent**: Concurrency is built into the language itself, not bolted on via external libraries.
