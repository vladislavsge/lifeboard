import { builder } from './builder.js';

// Импорт модулей регистрирует их поля в builder
import './auth.js';
import './mfa.js';
import './passkey.js';
import './invite.js';
import './sync.js';
import './push.js';

export const schema = builder.toSchema();
