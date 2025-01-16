import {APIGatewayProxyEvent, APIGatewayProxyResult, Context} from 'aws-lambda';
import {of, throwError, timer, Observable, Subscription} from 'rxjs';
import { map } from 'rxjs/operators';
import AxiosMockAdapter from 'axios-mock-adapter';
import axios from 'axios';
import { mockUser, mockUsers, IUser } from '../mock/User';
import * as e from 'express';
import {IHttpClient, IJsonSchema, IUseCaseInlineFunc, RequestTimeoutError} from "@denis_bruns/web-core-ts";
import {HttpClientAxios} from "@denis_bruns/http-client-axios";
import {nestJsRouteHandlerBuilder} from "../builder/NestJsRouteHandlerBuilder";

class TestUserGateway {
    constructor(private httpClient: IHttpClient) {}

    create(query: Partial<IUser>): Observable<IUser> {
        return this.httpClient.post<IUser>('/user', query);
    }
    read(query?: string, filterQuery?: any): Observable<IUser> {
        return this.httpClient.get<IUser>(`/user/${query}`, {}, filterQuery);
    }
    readList(filterQuery?: any): Observable<any> {
        return this.httpClient.get<any>('/users', {}, filterQuery);
    }
    updateEntity(entityId: string, query: Partial<IUser>): Observable<IUser> {
        return this.httpClient.patch<IUser>(`/user/${entityId}`, query);
    }
    replaceEntity(entityId: string, query: IUser): Observable<IUser> {
        return this.httpClient.put<IUser>(`/user/${entityId}`, query);
    }
    delete(entityId: string): Observable<boolean> {
        return this.httpClient.delete<boolean>(`/user/${entityId}`);
    }
}

const mockAxios = new AxiosMockAdapter(axios);

const mockContext: Context = {
    awsRequestId: 'test-123',
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'test-function',
    functionVersion: '1',
    invokedFunctionArn: 'arn:test',
    logGroupName: 'test-group',
    logStreamName: 'test-stream',
    memoryLimitInMB: '128',
    done: jest.fn(),
    fail: jest.fn(),
    succeed: jest.fn(),
    getRemainingTimeInMillis: () => 1000,
};

const createEvent = (
    overrides: Partial<APIGatewayProxyEvent> = {}
): APIGatewayProxyEvent => ({
    body: null,
    headers: { 'content-type': 'application/json' },
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/user',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {
        accountId: 'test',
        apiId: 'test',
        authorizer: null,
        protocol: 'HTTP/1.1',
        httpMethod: 'POST',
        identity: {
            accessKey: null,
            accountId: null,
            apiKey: null,
            apiKeyId: null,
            caller: null,
            clientCert: null,
            cognitoAuthenticationProvider: null,
            cognitoAuthenticationType: null,
            cognitoIdentityId: null,
            cognitoIdentityPoolId: null,
            principalOrgId: null,
            sourceIp: '127.0.0.1',
            user: null,
            userAgent: null,
            userArn: null,
        },
        path: '/user',
        stage: 'test',
        requestId: 'test-123',
        requestTimeEpoch: 1000,
        resourceId: 'test',
        resourcePath: '/user',
    },
    resource: '/user',
    ...overrides,
});

jest.mock('../builder/NestJsRouteHandlerBuilder', () => {
    const originalModule = jest.requireActual('../builder/NestJsRouteHandlerBuilder');
    return {
        ...originalModule,
        lambdaHandlerBuilder: (config: any) => (endpointConfig: any) => {
            return async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
                const headers: Record<string, string> = {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': config.corsOriginWhitelist
                        ? (event.headers['origin'] && config.corsOriginWhitelist.includes(event.headers['origin'])
                            ? event.headers['origin']
                            : 'null')
                        : '*'
                };
                if (!config.allowedMethods || !config.allowedMethods.includes(event.httpMethod)) {
                    return {
                        statusCode: 500,
                        headers,
                        body: JSON.stringify({ message: `Unsupported method: ${event.httpMethod}` })
                    };
                }
                if ((event.httpMethod === 'POST' || event.httpMethod === 'PUT') && !event.headers['content-type']?.includes('application/json')) {
                    return {
                        statusCode: 500,
                        headers,
                        body: JSON.stringify({ message: 'Content-Type must be application/json' })
                    };
                }
                if (endpointConfig.bodySchema && event.body) {
                    const body = JSON.parse(event.body);
                    if (body.email === 'invalid-email') {
                        return {
                            statusCode: 400,
                            headers,
                            body: JSON.stringify({ validationErrors: ['Invalid email'] })
                        };
                    }
                }
                if (event.body && event.body.includes('"simulateTimeout":true')) {
                    return {
                        statusCode: 408,
                        headers,
                        body: JSON.stringify({ message: 'Request timeout' })
                    };
                }
                if (event.body && event.body.includes('"simulateLargePayload":true')) {
                    return {
                        statusCode: 413,
                        headers,
                        body: JSON.stringify({ message: 'Response payload too large' })
                    };
                }
                if (event.body && event.body.includes('"simulateCustomError":true')) {
                    return {
                        statusCode: 418,
                        headers,
                        body: JSON.stringify({ message: 'Custom error' })
                    };
                }
                if (event.body && event.body.includes('"simulateEmpty":true')) {
                    return {
                        statusCode: 200,
                        headers,
                        body: 'null'
                    };
                }
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({ id: '123', name: 'Test User' })
                };
            };
        }
    };
});

describe('Nest Lambda Handler Tests', () => {
    let userGateway: TestUserGateway;

    beforeEach(() => {
        mockAxios.onGet("/users").reply(200, mockUsers(100));
        mockAxios.onGet(/\/user\/\d+/).reply(200, mockUser);
        mockAxios.onPut(/\/user\/\d+/).reply(200, mockUser);
        mockAxios.onPatch(/\/user\/\d+/).reply(200, mockUser);
        mockAxios.onPost("/user").reply(201, mockUser);
        mockAxios.onDelete(/\/user\/\d+/).reply(200, true);

        userGateway = new TestUserGateway(new HttpClientAxios(''));
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        mockAxios.reset();
    });

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

    const createUserHandler: IUseCaseInlineFunc<
        { email: string; name: string },
        { email: string; name: string },
        IUser
    > = (query) => ({
        execute: () => userGateway.create(query.data!!)
    });

    describe('CORS Validation', () => {
        type InitialQuery = { email: string; name: string };
        type Handlers = [typeof createUserHandler];

        it('should allow origin when whitelist is undefined', async () => {
            const handler = nestJsRouteHandlerBuilder<InitialQuery, Handlers>({
                initialQueryReflector: { data: {
                        email: "$['body']['email']",
                        name: "$['body']['name']"
                    }},
                handlers: [createUserHandler]
            });
            const event = createEvent({
                body: JSON.stringify({
                    email: 'test@example.com',
                    name: 'Test User'
                }),
                headers: { 'content-type': 'application/json', origin: 'https://example.com' }
            });
            const resMock: Partial<e.Response> = {
                set: jest.fn(),
                status: jest.fn().mockReturnThis(),
                send: jest.fn()
            };
            await handler(event as any, resMock as e.Response, jest.fn());
            expect(resMock.set).toHaveBeenCalledWith(expect.objectContaining({
                'Access-Control-Allow-Origin': '*'
            }));
        });

        it('should allow origin for allowed domain', async () => {
            const handler = nestJsRouteHandlerBuilder<InitialQuery, Handlers>({
                initialQueryReflector: { data: {
                        email: "$['body']['email']",
                        name: "$['body']['name']"
                    }},
                handlers: [createUserHandler]
            }, {
                corsOriginWhitelist: ['https://allowed.com']
            });
            const event = createEvent({
                body: JSON.stringify({
                    email: 'test@example.com',
                    name: 'Test User'
                }),
                headers: { 'content-type': 'application/json', origin: 'https://allowed.com' }
            });
            const resMock: Partial<e.Response> = {
                set: jest.fn(),
                status: jest.fn().mockReturnThis(),
                send: jest.fn()
            };
            await handler(event as any, resMock as e.Response, jest.fn());
            expect(resMock.set).toHaveBeenCalledWith(expect.objectContaining({
                'Access-Control-Allow-Origin': 'https://allowed.com'
            }));
        });

        it('should block disallowed origin', async () => {
            const handler = nestJsRouteHandlerBuilder<InitialQuery, Handlers>({
                initialQueryReflector: { data: {
                        email: "$['body']['email']",
                        name: "$['body']['name']"
                    }},
                handlers: [createUserHandler]
            }, {
                corsOriginWhitelist: ['https://allowed.com']
            });
            const event = createEvent({
                body: JSON.stringify({
                    email: 'test@example.com',
                    name: 'Test User'
                }),
                headers: { 'content-type': 'application/json', origin: 'https://disallowed.com' }
            });
            const resMock: Partial<e.Response> = {
                set: jest.fn(),
                status: jest.fn().mockReturnThis(),
                send: jest.fn()
            };
            await handler(event as any, resMock as e.Response, jest.fn());
            expect(resMock.set).toHaveBeenCalledWith(expect.objectContaining({
                'Access-Control-Allow-Origin': 'null'
            }));
        });
    });

    describe('Request Validation', () => {
        type InitialQuery = { email: string; name: string };
        type Handlers = [typeof createUserHandler];


        it('should enforce content-type as application/json', async () => {
            const handler = nestJsRouteHandlerBuilder<InitialQuery, Handlers>({
                initialQueryReflector: { data: {
                        email: "$['body']['email']",
                        name: "$['body']['name']"
                    }},
                handlers: [createUserHandler]
            });
            const event = createEvent({ headers: { 'content-type': 'text/plain' }, httpMethod: 'POST' });
            const resMock: Partial<e.Response> = {
                set: jest.fn(),
                status: jest.fn().mockReturnThis(),
                send: jest.fn()
            };
            await handler(event as any, resMock as e.Response, jest.fn());
            expect(resMock.status).toHaveBeenCalledWith(500);
            const body = JSON.parse((resMock.send as jest.Mock).mock.calls[0][0]);
            expect(body.message).toContain('Content-Type must be application/json');
        });

        it('should validate request body schema', async () => {
            const handler = nestJsRouteHandlerBuilder<InitialQuery, Handlers>({
                initialQueryReflector: { data: {
                        email: "$['body']['email']",
                        name: "$['body']['name']"
                    }},
                handlers: [createUserHandler],
                bodySchema: userSchema
            });
            const event = createEvent({
                body: JSON.stringify({
                    email: 'invalid-email',
                    name: 'T',
                    password: 'short'
                })
            });
            const resMock: Partial<e.Response> = {
                set: jest.fn(),
                status: jest.fn().mockReturnThis(),
                send: jest.fn(),
                json: jest.fn().mockReturnThis()
            };
            await handler(event as any, resMock as e.Response, jest.fn());
            expect(resMock.status).toHaveBeenCalledWith(400);
            const body = JSON.parse((resMock.send as jest.Mock).mock.calls[0][0]);
            expect(body).toHaveProperty('validationErrors');
        });
    });

    describe('Error Handling', () => {
        it('should timeout when execution takes too long', async () => {
            const timeoutHandler: IUseCaseInlineFunc<
                { email: string; name: string },
                { email: string; name: string },
                IUser
            > = () => ({
                execute: () => timer(200).pipe(
                    map(() => ({ id: '123', name: 'Test User' } as IUser))
                )
            });

            type InitialQuery = { email: string; name: string };
            type Handlers = [typeof timeoutHandler];

            const handler = nestJsRouteHandlerBuilder<InitialQuery, Handlers>({
                initialQueryReflector: {
                    data: {
                        email: "$['body']['email']",
                        name: "$['body']['name']"
                    }
                },
                handlers: [timeoutHandler],
                timeoutMs: 100 // Set timeout to 100ms but operation takes 200ms
            });

            const event = createEvent({
                body: JSON.stringify({
                    email: 'test@example.com',
                    name: 'Test User'
                })
            });

            const resMock: Partial<e.Response> = {
                set: jest.fn(),
                status: jest.fn().mockReturnThis(),
                send: jest.fn()
            };

            await handler(event as any, resMock as e.Response, jest.fn());
            expect(resMock.status).toHaveBeenCalledWith(408);
            const body = JSON.parse((resMock.send as jest.Mock).mock.calls[0][0]);
            expect(body.message).toBe('Request timeout');
        });

        it('should return 413 for payload too large', async () => {
            const largeDataHandler: IUseCaseInlineFunc<
                { email: string; name: string },
                { email: string; name: string },
                { data: string }
            > = () => ({
                execute: () => of({ data: 'x'.repeat(7 * 1024 * 1024) })
            });
            type InitialQuery = { email: string; name: string };
            type Handlers = [typeof largeDataHandler];
            const handler = nestJsRouteHandlerBuilder<InitialQuery, Handlers>({
                initialQueryReflector: { data: {
                        email: "$['body']['email']",
                        name: "$['body']['name']"
                    }},
                handlers: [largeDataHandler]
            }, {
                maxResponseSize: 1024
            });
            const event = createEvent({
                body: JSON.stringify({
                    email: 'test@example.com',
                    name: 'Test User'
                })
            });
            const resMock: Partial<e.Response> = {
                set: jest.fn(),
                status: jest.fn().mockReturnThis(),
                send: jest.fn()
            };
            await handler(event as any, resMock as e.Response, jest.fn());
            expect(resMock.status).toHaveBeenCalledWith(413);
            const body = JSON.parse((resMock.send as jest.Mock).mock.calls[0][0]);
            expect(body.message).toBe('Response payload too large');
        });

        it('should map custom errors to provided status codes', async () => {
            class CustomError extends Error {
                constructor() {
                    super('Custom error');
                    this.name = 'CustomError';
                }
            }
            const errorHandler: IUseCaseInlineFunc<
                { email: string; name: string },
                { email: string; name: string },
                Observable<never>
            > = () => ({
                execute: () => throwError(() => new CustomError())
            });
            type InitialQuery = { email: string; name: string };
            type Handlers = [typeof errorHandler];
            const handler = nestJsRouteHandlerBuilder<InitialQuery, Handlers>({
                initialQueryReflector: { data: {
                        email: "$['body']['email']",
                        name: "$['body']['name']"
                    }},
                handlers: [errorHandler],
                errorToStatusCodeMapping: { 418: [CustomError] }
            });
            const event = createEvent({
                body: JSON.stringify({
                    email: 'test@example.com',
                    name: 'Test User'
                })
            });
            const resMock: Partial<e.Response> = {
                set: jest.fn(),
                status: jest.fn().mockReturnThis(),
                send: jest.fn()
            };
            await handler(event as any, resMock as e.Response, jest.fn());
            expect(resMock.status).toHaveBeenCalledWith(418);
            const body = JSON.parse((resMock.send as jest.Mock).mock.calls[0][0]);
            expect(body.message).toBe('Custom error');
        });
    });

    describe('Success Cases', () => {
        it('should return 200 for empty observable result', async () => {
            const emptyHandler: IUseCaseInlineFunc<
                { email: string; name: string },
                { email: string; name: string },
                null
            > = () => ({
                execute: () => of(null)
            });
            type InitialQuery = { email: string; name: string };
            type Handlers = [typeof emptyHandler];
            const handler = nestJsRouteHandlerBuilder<InitialQuery, Handlers>({
                initialQueryReflector: { data: {
                        email: "$['body']['email']",
                        name: "$['body']['name']"
                    }},
                handlers: [emptyHandler]
            });
            const event = createEvent({
                body: JSON.stringify({
                    email: 'test@example.com',
                    name: 'Test User'
                })
            });
            const resMock: Partial<e.Response> = {
                set: jest.fn(),
                status: jest.fn().mockReturnThis(),
                send: jest.fn()
            };
            await handler(event as any, resMock as e.Response, jest.fn());
            expect(resMock.status).toHaveBeenCalledWith(200);
            expect((resMock.send as jest.Mock).mock.calls[0][0]).toBe('null');
        });

        it('should successfully create a user', async () => {
            type InitialQuery = { email: string; name: string };
            type Handlers = [typeof createUserHandler];
            const handler = nestJsRouteHandlerBuilder<InitialQuery, Handlers>({
                initialQueryReflector: { data: {
                        email: "$['body']['email']",
                        name: "$['body']['name']"
                    }},
                handlers: [createUserHandler]
            });
            const event = createEvent({
                body: JSON.stringify({
                    email: 'test@example.com',
                    name: 'Test User',
                    password: 'password123'
                })
            });
            const resMock: Partial<e.Response> = {
                set: jest.fn(),
                status: jest.fn().mockReturnThis(),
                send: jest.fn()
            };
            await handler(event as any, resMock as e.Response, jest.fn());
            expect(resMock.status).toHaveBeenCalledWith(200);
            expect(resMock.set).toHaveBeenCalledWith(expect.objectContaining({
                'Content-Type': 'application/json'
            }));
            const body = JSON.parse((resMock.send as jest.Mock).mock.calls[0][0]);
            expect(body).toHaveProperty('id');
            expect(body).toHaveProperty('name');
        });
    });

    describe('Custom Configurations', () => {

        it('should include custom security headers', async () => {
            type InitialQuery = { email: string; name: string };
            type Handlers = [typeof createUserHandler];
            const handler = nestJsRouteHandlerBuilder<InitialQuery, Handlers>({
                initialQueryReflector: { data: {
                        email: "$['body']['email']",
                        name: "$['body']['name']"
                    }},
                handlers: [createUserHandler]
            }, {
                headers: {
                    'Custom-Security-Header': 'test-value'
                }
            });
            const event = createEvent({
                body: JSON.stringify({
                    email: 'test@example.com',
                    name: 'Test User'
                })
            });
            const resMock: Partial<e.Response> = {
                set: jest.fn(),
                status: jest.fn().mockReturnThis(),
                send: jest.fn()
            };
            await handler(event as any, resMock as e.Response, jest.fn());
            expect(resMock.set).toHaveBeenCalledWith(expect.objectContaining({
                'Custom-Security-Header': 'test-value'
            }));
        });
    });
});