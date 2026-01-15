# Versionado (alpha / beta / estable)

Este repo usa SemVer ($MAJOR.MINOR.PATCH) con canales mediante pre-release.

## Definicion de canales

- **Alpha**: versiones `0.y.z` (o `x.y.z-alpha.n`) para cambios rapidos y potencialmente incompatibles.
- **Beta**: versiones `x.y.z-beta.n` cuando el API/UX esta casi estable pero puede haber ajustes.
- **Estable**: versiones `>= 1.0.0` sin sufijo pre-release.

Recomendacion practica:

- Mientras la base evoluciona fuerte, mantener `0.y.z`.
- Cuando el contrato principal (API docente + portal + frontend) este consolidado, mover a `1.0.0-beta.1`.
- Promover a `1.0.0` cuando:
  - `npm run test:ci` este verde
  - docs (incluyendo `npm run docs:check`) este verde
  - no haya cambios breaking pendientes

## Workflow recomendado

1) Actualiza `CHANGELOG.md` con lo que cambio.
2) Ejecuta `npm run test:ci`.
3) Crea tag de release (manual) y publica artefactos según tu pipeline.

Notas:

- En monorepos, este repo usa una **version unica** en la raiz para representar el estado del sistema.
- Si en el futuro necesitas versionar apps por separado, se puede migrar a versionado por paquete (p.ej. Changesets).
