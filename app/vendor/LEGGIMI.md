# Librerie copiate nel repository

Nessun `npm install`: i moduli sono stati estratti dai pacchetti ufficiali del registro npm, dopo aver verificato l'impronta `integrity` pubblicata dal registro.

| File | Pacchetto | Licenza | Integrità del pacchetto (registro npm) | SHA-256 del file |
|---|---|---|---|---|
| `preact.module.js` | preact 10.24.3 (`dist/`) | MIT (`LICENSE-preact.txt`) | `sha512-Z2dPnBnMUfyQfSQ+GBdsGa16hz35YmLmtTLhM169uW944hYL6xzTYkJjC07j+Wosz733pMWx0fgON3JNw1jJQA==` | `9ba8bb591b0c9a72132ff65a76e69c5a4e49cf71721b47b659f3243658bde05b` |
| `hooks.module.js` | preact 10.24.3 (`hooks/dist/`) | MIT | (stesso pacchetto) | `896fc8e546b96c3fca29743b493293820ad4e76396fd36ff05f18a52eaf303e1` |
| `htm.module.js` | htm 3.1.1 (`dist/`) | Apache-2.0 (`LICENSE-htm.txt`) | `sha512-983Vyg8NwUE7JkZ6NmOqpCZ+sh1bKv2iYTlUkzlWmA5JD2acKoxd4KVxbMmxX/85mtfdnDmTFoNKcg5DGAvxNQ==` | `ab33dd3f38059b9be4d5f5350128eefb2356639c4e0bbe9d9e8b3ba75847e9e4` |

`hooks.module.js` importa `preact` con un nome di modulo: lo risolve la mappa di importazione in `app/index.html` (Safari iOS 16.4 o successivo).
Le icone dell'interfaccia sono tratte dai mockup e provengono dalla collezione Phosphor (licenza MIT).
