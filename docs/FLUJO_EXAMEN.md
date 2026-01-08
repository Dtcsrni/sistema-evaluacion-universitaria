# Flujo de examen

## 1) Crear banco de preguntas
- Docente crea preguntas con 5 opciones y 1 correcta.
- Se guarda version actual y se permite versionado futuro.

## 2) Crear plantilla de examen
- Se define tipo (parcial/global), titulo e instrucciones.
- Se asocian preguntas del banco.

## 3) Generar examenes imprimibles
- Se aleatoriza orden de preguntas y opciones.
- Se genera PDF carta con QR por pagina.
- Se guarda `mapaVariante` para reconstruir respuestas correctas.

## 4) Imprimir
- Impresion a doble cara segun tipo:
  - Parcial: 1 hoja (2 paginas).
  - Global: 2 hojas (4 paginas).

## 5) Vincular al recibir
- Se escanea QR de la primera pagina.
- Se busca alumno y se vincula examen -> alumno.
- Estado cambia a ENTREGADO.

## 6) Escaneo OMR
- Captura desde celular o camara.
- Se detecta QR y pagina.
- Se corrige perspectiva con marcas.
- Se detectan burbujas y se genera vista de verificacion.

## 7) Calificar
- Se compara con clave real segun `mapaVariante`.
- Calificacion exacta:
  - calificacion = (aciertos * 5) / totalReactivos
  - bono maximo 0.5, calificacion final tope 5.0
- Parcial/global: 5 examen + 5 evaluacion continua o proyecto (tope 10).
- Banderas de revision solo como sugerencias (sin acusaciones automaticas).

## 8) Publicar y portal alumno
- Docente publica resultados hacia nube.
- Alumno consulta resultados en portal siempre disponible.

## 9) Exportar CSV
- Exportacion CSV sin dependencias de Excel.
- Endpoint: `POST /api/analiticas/exportar-csv`.
