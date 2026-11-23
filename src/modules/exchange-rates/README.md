# Módulo `exchange-rates`

## Endpoint: `GET /api/exchange-rates`

Consulta la tasa de cambio vigente entre monedas soportadas (`USD`, `EUR`, `ARS`) y, opcionalmente, calcula una conversión en formato string decimal.

### Query Parameters
- `from` (**requerido**): moneda origen (`USD` | `EUR` | `ARS`).
- `to` (**requerido**): moneda destino (`USD` | `EUR` | `ARS`).
- `amount` (*opcional*): monto a convertir en string decimal positivo (ej. `"100.50"`).

### Ejemplo de respuesta (`200 OK`)
```json
{
  "fromCurrency": "USD",
  "toCurrency": "EUR",
  "rate": "0.921500",
  "provider": "ExchangeRate-API",
  "cached": false,
  "fetchedAt": "2026-11-22T17:00:00.000Z",
  "amount": "100.50",
  "convertedAmount": "92.6108"
}