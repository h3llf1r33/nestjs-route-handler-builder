# @denis_bruns/nestjs-route-handler-builder

> **A flexible NestJS route handler builder that offers JSON Schema validation, async/Observable flows, and various configurations.**

[![NPM Version](https://img.shields.io/npm/v/@denis_bruns/nestjs-route-handler-builder?style=flat-square&logo=npm)](https://www.npmjs.com/package/@denis_bruns/nestjs-route-handler-builder)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![GitHub](https://img.shields.io/badge/GitHub--181717.svg?style=flat-square&logo=github)](https://github.com/h3llf1r33/nestjs-route-handler-builder)

---

## Overview

`@denis_bruns/nestjs-route-handler-builder` brings together **NestJS**, **RxJS**, and **AJV**-based **JSON Schema** validation to simplify server request handling. It helps you:

- **Validate** request bodies against JSON Schemas at runtime
- **Reflect** initial body or query parameters using [`@denis_bruns/data-reflector`](https://www.npmjs.com/package/@denis_bruns/data-reflector)
- Build **async** or **Observable**-based flows using your own “use cases” or **inline** handler functions
- Generate consistent **CORS** and **security** headers out of the box
- Define **custom** error mappings (HTTP status codes for particular error classes)
- Enforce a **payload size limit** and optional **request timeout** to guard against resource hogs

This library is particularly useful in a **clean architecture** or **onion architecture** context, where you separate concerns into **use cases** or **interactors** that run within each request.

---

## Key Features

1. **Inline “Use Case” Functions**
    - Provide a function that returns an **Observable** or **Promise** to handle the request logic.
    - Chain multiple handlers in sequence to build complex flows.

2. **JSON Schema Validation**
    - Validate request bodies using `ajv` for robust error reporting.
    - Provide your schema in the route config (`bodySchema`).

3. **Reflectors for Body and Query**
    - Use [`reflect`](https://www.npmjs.com/package/@denis_bruns/data-reflector) from `@denis_bruns/data-reflector` to transform request data or extract partial info from nested structures.

4. **CORS & Security Headers**
    - Built-in **CORS** origin whitelisting.
    - Default security headers like `Strict-Transport-Security`, `X-Frame-Options`, etc.

5. **Timeout & Payload Size Limits**
    - **`timeoutMs`** option triggers `RequestTimeoutError` if the use case doesn’t resolve in time.
    - **`maxResponseSize`** ensures final JSON response isn’t too large, returning `PayloadTooLargeError` if exceeded.

6. **Custom Error-to-Status Mappings**
    - Map your **custom** or built-in error classes to specific HTTP status codes.
    - Example: `CustomNotFoundError -> 404`, `CustomAuthError -> 401`, etc.

---

## Installation

With **npm**:

```bash
npm install @denis_bruns/nestjs-route-handler-builder
```

Or with **yarn**:

```bash
yarn add @denis_bruns/nestjs-route-handler-builder
```

You also need **NestJS** and **Express** (or a Nest platform), plus any optional libraries you want:

```bash
npm install ajv ajv-formats ajv-errors rxjs express
```

---

## Basic Usage

Below is a **simple** NestJS controller example using `nestJsRouteHandlerBuilder`:

```ts
// user.controller.ts
import { Controller, Post, Req, Res, Next } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { nestJsRouteHandlerBuilder } from '@denis_bruns/nestjs-route-handler-builder';
import { IUseCaseInlineFunc, IJsonSchema } from '@denis_bruns/web-core-ts';

interface UserDTO {
  email: string;
  name: string;
  password: string;
}
interface CreatedUser {
  id: string;
  name: string;
}

// 1) Define your AJV JSON schema
const userSchema: IJsonSchema = {
  type: 'object',
  properties: {
    email: { type: 'string', format: 'email' },
    name: { type: 'string', minLength: 2 },
    password: { type: 'string', minLength: 8 }
  },
  required: ['email', 'name', 'password'],
  additionalProperties: false
};

// 2) Example "use case" inline function
const createUserUseCase: IUseCaseInlineFunc<UserDTO, UserDTO, CreatedUser> = (query) => ({
  execute: () => {
    // your create user logic here...
    return Promise.resolve({ id: '123', name: query.data?.name! });
  }
});

@Controller('user')
export class UserController {
  // 3) Build your route handler
  private readonly createUserHandler = nestJsRouteHandlerBuilder<
    UserDTO, // The shape for the initial query
    [typeof createUserUseCase] // A tuple of inline functions
  >({
    // A "reflector" describing how to pick up data from the request body
    initialQueryReflector: {
      data: {
        email: "$['body']['email']",
        name: "$['body']['name']",
        password: "$['body']['password']"
      }
    },
    handlers: [createUserUseCase],
    bodySchema: userSchema, // JSON Schema for request body
    timeoutMs: 3000, // optional, throws RequestTimeoutError if over 3s
    errorToStatusCodeMapping: {
      400: [], // schema errors default to 400
      404: [], 
      // ... custom errors
    }
  }, {
    // Handler options
    corsOriginWhitelist: ['https://mydomain.com'], // or undefined for no restriction
    maxResponseSize: 3 * 1024 * 1024, // 3 MB
    headers: {
      // override default security headers
      'X-Custom-Header': 'HelloWorld'
    }
  });

  @Post()
  async createUser(@Req() req: Request, @Res() res: Response, @Next() next: NextFunction) {
    // 4) Just call the built handler (Express-compatible)
    return await this.createUserHandler(req, res, next);
  }
}
```

### Explanation

1. **`bodySchema`** – `ajv` uses this to validate the request body. If validation fails, an error with `validationErrors` is returned.
2. **`initialQueryReflector`** – This uses `@denis_bruns/data-reflector` to parse the relevant fields out of `req.body` (or path/query parameters).
3. **`handlers`** – The inline function(s) that will be executed in order, each returning an `Observable` or `Promise`.
4. **`timeoutMs`** & **`maxResponseSize`** – Protect your service from slow or large payloads.
5. **CORS** – Provide a `corsOriginWhitelist` array to allow specific origins or default to `*`.

### Custom Error Mappings

If your “use case” throws custom errors, you can map them to specific status codes:

```ts
class MyCustomError extends Error {}

const myUseCase: IUseCaseInlineFunc<UserDTO, UserDTO, CreatedUser> = (query) => ({
  execute: () => {
    if (!query.data?.email?.endsWith('@allowed.com')) {
      throw new MyCustomError('Only allowed.com domain is permitted.');
    }
    return Promise.resolve({ id: '777', name: query.data.name! });
  }
});

const handler = nestJsRouteHandlerBuilder<UserDTO, [typeof myUseCase]>({
  initialQueryReflector: {/* ... */},
  handlers: [myUseCase],
  errorToStatusCodeMapping: {
    418: [MyCustomError], // Return 418 for MyCustomError
  }
});
```

---

## Related Packages

- **@denis_bruns/web-core-ts**  
  [![NPM](https://img.shields.io/npm/v/@denis_bruns/web-core-ts?style=flat-square&logo=npm)](https://www.npmjs.com/package/@denis_bruns/web-core-ts)  
  [![GitHub](https://img.shields.io/badge/GitHub--181717.svg?style=flat-square&logo=github)](https://github.com/h3llf1r33/web-core-ts)  
  *Core types like `IUseCaseInlineFunc`, `IQueryType`, `IJsonSchema`, and essential error classes.*

- **@denis_bruns/data-reflector**  
  [![NPM](https://img.shields.io/npm/v/@denis_bruns/data-reflector?style=flat-square&logo=npm)](https://www.npmjs.com/package/@denis_bruns/data-reflector)  
  [![GitHub](https://img.shields.io/badge/GitHub--181717.svg?style=flat-square&logo=github)](https://github.com/h3llf1r33/data-reflector)  
  *Used for the “reflector” mechanism to extract/transform request data via JSONPath or functions.*

---

## Contributing

Questions, issues, or improvements? Feel free to open a pull request or file an issue on [GitHub](https://github.com/h3llf1r33/nestjs-route-handler-builder).

---

## License

This project is [MIT licensed](LICENSE).

---

<p align="center">
  Built with ❤️ by <a href="https://github.com/h3llf1r33">h3llf1r33</a>
</p>