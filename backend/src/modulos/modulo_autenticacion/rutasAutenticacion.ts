/**
 * Rutas de autenticacion.
 */
import { Router } from 'express';
import { ingresarDocente } from './controladorAutenticacion';

const router = Router();

router.post('/ingresar', ingresarDocente);

export default router;
