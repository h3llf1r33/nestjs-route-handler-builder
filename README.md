# 🏗️ Clean Architecture Core

> A comprehensive TypeScript library implementing clean architecture patterns with powerful data handling, HTTP client management, and AWS integration capabilities.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![npm version](https://img.shields.io/npm/v/@denis_bruns/clean-architecture-core.svg?style=flat-square)](https://www.npmjs.com/package/@denis_bruns/clean-architecture-core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub](https://img.shields.io/badge/GitHub-181717.svg?style=flat-square&logo=github)](https://github.com/h3llf1r33/clean-architecture-core)

## 📋 Example Projects
Check out these example projects that demonstrate the library in action:
* 🔷 [Angular Clean Architecture Example](https://github.com/h3llf1r33/angular-clean-architecture-lambda-example-ts) - Frontend implementation using Angular
* ⚡ [Serverless Clean Architecture Example](https://github.com/h3llf1r33/serverless-clean-architecture-lambda-example-ts) - Backend implementation using AWS Lambda

## ✨ Features

### Core Architecture
- 🏛️ Complete Clean Architecture implementation with segregated interfaces
- 🔄 Reactive programming with RxJS
- 🎯 Type-safe interfaces and implementations
- 🧩 Modular and extensible design

### Data Handling
- 🔍 Advanced filtering and query system
- 📊 DynamoDB integration with expression building
- 🔁 Data transformation with reflection
- 🛡️ Robust validation and error handling
- 📑 Enhanced pagination with sorting capabilities
- 🔢 Total count support for pagination

### HTTP & API
- 🌐 RxJS-powered HTTP client with middleware support
- 🔐 AWS Secrets Manager integration
- 🧰 Middleware system for request/response handling
- 🎭 CORS and security headers management

## 📥 Installation

```bash
npm install @denis_bruns/clean-architecture-core
```

## 🧩 Core Components

### Enhanced Pagination System

The library now includes a robust pagination system with sorting capabilities:

```typescript
interface IPaginationQuery {
    page?: number;
    limit?: number;
    offset?: number;
    sortBy?: string;
    sortDirection?: 'asc' | 'desc';
}

interface IPaginatedResponse<T> {
    data: T[];
    total: number;  // Total number of items available
    page: number;
    limit: number;
}
```

Example usage with sorting and pagination:

```typescript
const filterQuery: IGenericFilterQuery = {
    filters: [
        { field: 'status', operator: '=', value: 'active' }
    ],
    pagination: {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortDirection: 'desc'
    }
};

const result = await fetchWithFiltersAndPagination<User>(
    'users-table',
    filterQuery,
    dynamoDBClient
);

console.log(`Found ${result.total} total items`);
console.log(`Showing ${result.data.length} items on page ${result.page}`);
```

### Entity Gateway Pattern

The Entity Gateway pattern uses segregated interfaces for cleaner composition:

```typescript
interface IEntityGatewayCrud<
    CREATE_OR_UPDATE_QUERY,
    RESPONSE_MODEL,
    FILTER_QUERY,
    READ_ENTITY_ID,
    UPDATE_ENTITY_ID,
    DELETE_ENTITY_ID,
    DELETE_RESPONSE_MODEL
> extends
    IEntityGatewayCreate<CREATE_OR_UPDATE_QUERY, RESPONSE_MODEL>,
    IEntityGatewayRead<READ_ENTITY_ID, FILTER_QUERY, RESPONSE_MODEL>,
    IEntityGatewayReadList<FILTER_QUERY, RESPONSE_MODEL>,
    IEntityGatewayPut<UPDATE_ENTITY_ID, CREATE_OR_UPDATE_QUERY, RESPONSE_MODEL>,
    IEntityGatewayPatch<UPDATE_ENTITY_ID, CREATE_OR_UPDATE_QUERY, RESPONSE_MODEL>,
    IEntityGatewayDelete<DELETE_ENTITY_ID, DELETE_RESPONSE_MODEL> {
}
```

Individual interfaces for each operation:

```typescript
interface IEntityGatewayCreate<QUERY, RESPONSE_MODEL> {
    create(query: Partial<QUERY>, config?: HttpClientRequestOptions): Observable<RESPONSE_MODEL>
}

interface IEntityGatewayRead<ENTITY_ID, FILTER_QUERY, RESPONSE_MODEL> {
    read(entityId?: ENTITY_ID, filterQuery?: FILTER_QUERY, config?: HttpClientRequestOptions): Observable<RESPONSE_MODEL>
}

interface IEntityGatewayReadList<FILTER_QUERY, RESPONSE_MODEL> {
    readList(filterQuery?: FILTER_QUERY, config?: HttpClientRequestOptions): Observable<IPaginatedResponse<RESPONSE_MODEL>>
}
```

### HTTP Client

Enhanced HTTP client with middleware support and type-safe request options:

```typescript
interface IHttpClient {
    baseUrl: string;
    request<T, R extends boolean = false>(
        method: HttpMethodType,
        path: string,
        options: {
            config?: HttpClientRequestOptions;
            body?: Record<string, any>;
            returnFullResponse?: R;
        },
        filterQuery?: IGenericFilterQuery
    ): Observable<R extends true ? Axios.AxiosXHR<T> : T>;
    
    // Convenience methods
    get<T>(path: string, config?: HttpClientRequestOptions, filterQuery?: IGenericFilterQuery): Observable<T>;
    post<T>(path: string, body?: Record<string, any>, config?: HttpClientRequestOptions): Observable<T>;
    // ... other HTTP methods
}

type HttpMethodType = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
```

### DynamoDB Integration

Improved DynamoDB helpers with robust validation:

```typescript
function toDynamoDBValue(value: any): AttributeValue {
    if (value === null || value === undefined) {
        throw new DynamoValidationError("Value cannot be null or undefined");
    }
    
    if (typeof value === "string") return { S: value };
    if (typeof value === "number") return { N: value.toString() };
    if (typeof value === "boolean") return { BOOL: value };
    
    if (Array.isArray(value)) {
        if (!value.length) {
            throw new DynamoValidationError("Empty arrays not supported");
        }
        // Array handling logic
    }
    
    if (typeof value === "object") {
        // Object handling logic
    }
    
    throw new DynamoValidationError(`Unsupported type: ${typeof value}`);
}

function mapDynamoDBItemToType<T>(item: Record<string, AttributeValue>): T {
    // Type mapping logic with validation
}
```

### Filter Query System

Advanced filtering with type-safe operators:

```typescript
type IOperator = "<" | ">" | "<=" | ">=" | "=" | "!=" | "in" | "not in" | "like" | "not like";

interface IFilterQuery {
    field: string;
    operator: IOperator;
    value: string | number | object | Array<string | number> | undefined | null;
}

interface IGenericFilterQuery {
    filters: IFilterQuery[];
    pagination: IPaginationQuery;
}
```

### Data Reflection

Type-safe data transformation using enhanced reflection:

```typescript
type DataReflector<Input, Output> = {
    [K in keyof Output]: DataReflectorValue<Input, Output[K]>;
};

type JsonPath<T> = `$${RecursivePath<T>}`;

// Usage example
interface InputType {
    user: {
        profile: {
            name: string;
            settings: Record<string, any>;
        };
    };
}

interface OutputType {
    displayName: string;
    preferences: any;
}

const reflector: DataReflector<InputType, OutputType> = {
    displayName: "$['user']['profile']['name']",
    preferences: "$['user']['profile']['settings']"
};

const output = reflect(reflector, input);
```

### Repository Pattern Implementation

Updated repository implementation with sorting support:

```typescript
class PostRepository {
    constructor(
        private readonly postGateway: IEntityGatewayCrud<
            Post,
            Post,
            IGenericFilterQuery,
            string,
            string,
            string,
            boolean
        >
    ) {}

    findByAuthor(authorId: string): Observable<Post[]> {
        return this.postGateway.readList({
            filters: [{
                field: 'authorId',
                operator: '=',
                value: authorId
            }],
            pagination: { page: 1, limit: 50 }
        });
    }

    findByAuthorSorted(authorId: string, sortBy: string, sortDirection: 'asc' | 'desc'): Observable<Post[]> {
        return this.postGateway.readList({
            filters: [{
                field: 'authorId',
                operator: '=',
                value: authorId
            }],
            pagination: {
                page: 1,
                limit: 50,
                sortBy,
                sortDirection
            }
        });
    }

    searchByContent(term: string): Observable<Post[]> {
        return this.postGateway.readList({
            filters: [{
                field: 'content',
                operator: 'like',
                value: term
            }],
            pagination: { page: 1, limit: 20 }
        });
    }
}
```

### Lambda Handler

Enhanced Lambda handler with error handling, response formatting, and use case chaining:

```typescript
interface IQueryType<T> = {
    data?: T;
    filterQuery?: IGenericFilterQuery;
    config?: HttpClientRequestOptions;
    entityId?: string;
};

interface IUseCase<DTO, RESPONSE_MODEL> {
    execute(query?: IQueryType<DTO>): Observable<RESPONSE_MODEL>
}

// Use Case Chaining Example
type IUseCaseInlineFunc<FUNC_DTO, USECASE_QUERY, USECASE_RESPONSE> = (
    query: IQueryType<FUNC_DTO>,
    event: APIGatewayProxyEvent
) => IUseCase<USECASE_QUERY, USECASE_RESPONSE>;

// First use case gets a user
const getUserCase: IUseCaseInlineFunc<never, never, User> = 
    (query) => ({
        execute: () => userGateway.read(query.entityId)
    });

// Second use case uses the user to get their posts
const getUserPosts: IUseCaseInlineFunc<User, never, Post[]> = 
    (query) => ({
        execute: () => postGateway.readList({
            filterQuery: {
                filters: [{
                    field: 'userId',
                    operator: '=',
                    value: query.data!.id  // query is IQueryType<User>
                }]
            }
        })
    });

// Third use case processes the posts
const processUserPosts: IUseCaseInlineFunc<Post[], never, ProcessedPosts> = 
    (query) => ({
        execute: () => processPostsLogic(query.data!)  // query is IQueryType<Post[]>
    });

// Chain them in the handler
const handler = lambdaHandlerBuilder<QueryType<never>, [
    typeof getUserCase,
    typeof getUserPosts,
    typeof processUserPosts
]>()({
    initialQueryReflector: {
        entityId: "$['pathParameters']['userId']"
    },
    handlers: [getUserCase, getUserPosts, processUserPosts],
    errorToStatusCodeMapping: {
        400: [ValidationError],
        404: [NotFoundError],
        413: [PayloadTooLargeError],
        408: [RequestTimeoutError]
    }
});

/* 
Use Case Chaining Process:
1. Handler extracts initial query from the event using initialQueryReflector
2. getUserCase receives the query and returns a User
3. getUserPosts automatically receives the User as input and returns Post[]
4. processUserPosts receives the Post[] and returns ProcessedPosts
5. Final result is returned as the API response

Key Benefits:
- Type-safe data flow between use cases
- Automatic error handling and response formatting
- Clean separation of concerns
- Reusable use case components
- Easy to test and maintain
*/
```

### Json schema body validation

```typescript
// DynamoDB validation
class DynamoValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'DynamoValidationError';
    }
}

// Schema validation
class SchemaValidationError extends Error {
    constructor(message: string, public readonly errors?: ErrorObject[]) {
        super(message);
        this.name = 'SchemaValidationError';
    }
}

// Request validation in Lambda handler
const handler = lambdaHandlerBuilder()({
    bodySchema: {
        type: 'object',
        properties: {
            title: { type: 'string', minLength: 1 },
            content: { type: 'string', minLength: 1 }
        },
        required: ['title', 'content']
    }
});
```

## 🔧 Configuration

### AWS Secrets Manager Integration

```typescript
const config: ISecretManagerConfig = {
    secretName: 'api/credentials',
    region: 'us-east-1',
    headerMappings: {
        'X-API-Key': 'API_KEY',
        'Authorization': 'AUTH_TOKEN'
    }
};

const middleware = createAwsSecretsMiddleware(config, httpRequestOptions);
```

### Environment Configuration

```typescript
const middleware = createEnvironmentMiddleware({
    'Authorization': 'API_TOKEN',
    'X-Custom-Header': 'CUSTOM_ENV_VAR'
}, httpRequestOptions);
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 🌟 Show your support

Give a ⭐️ if this project helped you!

## 📝 License

This project is [MIT](LICENSE) licensed.