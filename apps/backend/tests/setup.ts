import { instalarTestHardening } from '../../../test-utils/vitestStrict';

// Setup comun para pruebas del backend.
process.env.NODE_ENV = 'test';

instalarTestHardening();

