import { Response } from 'express';
import {EmptyError, firstValueFrom, from, map, Observable, switchMap, timeout} from 'rxjs';
import { v4 } from 'uuid';
import Ajv, {ErrorObject, FormatDefinition, KeywordDefinition} from 'ajv';
import addFormats from 'ajv-formats';
import ajvErrors from "ajv-errors";
import {
    HandlerConfig, IBaseRequestContext,
    IHandlerOptions,
    IJsonSchema, IQueryType, IUseCaseInlineFunc,
    PayloadTooLargeError, RequestTimeoutError,
    SchemaValidationError
} from "@denis_bruns/web-core-ts";
import {reflect} from "@denis_bruns/data-reflector";

const ajv = new Ajv({
    allErrors: true,
    verbose: true,
    validateSchema: true,
    removeAdditional: true,
    useDefaults: true,
    coerceTypes: true,
});

addFormats(ajv);

ajvErrors(ajv, {
    singleError: true,
});

const emailFormat: FormatDefinition<string> = {
    type: 'string',
    validate: (data: string): boolean => {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data);
    },
};

ajv.addFormat('email', emailFormat);

const customErrorsKeyword: KeywordDefinition = {
    keyword: 'customErrors',
    validate: (schema: any, data: any) => true,
    errors: true
};

ajv.addKeyword(customErrorsKeyword);

const DEFAULT_MAX_RESPONSE_SIZE = 6 * 1024 * 1024;
const DEFAULT_SECURITY_HEADERS = {
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'none'",
    'Cache-Control': 'no-store, max-age=0',
    'Pragma': 'no-cache'
};

const validateOrigin = (requestOrigin: string | undefined, whitelist: string[] | undefined): string => {
    if (!whitelist || !requestOrigin) return '*';
    return whitelist.includes(requestOrigin) ? requestOrigin : 'null';
};


const formatErrors = (errors: ErrorObject[] | null | undefined) => {
    if (!errors || errors.length === 0) return [];

    const result: Array<{ key: string; message: string }> = [];

    errors.forEach(error => {
        const pathSegments = error.instancePath
            .split('/')
            .filter(Boolean);

        let key: string;
        if (pathSegments.length > 0) {
            key = pathSegments.join('.');
        } else if (error.params.missingProperty) {
            const parentPath = pathSegments.join('.');
            key = parentPath ? `${parentPath}.${error.params.missingProperty}` : error.params.missingProperty;
        } else if (error.params.additionalProperty) {
            const parentPath = pathSegments.join('.');
            key = parentPath ? `${parentPath}.${error.params.additionalProperty}` : error.params.additionalProperty;
        } else if (error.params.format) {
            key = pathSegments.length > 0 ? pathSegments.join('.') : error.params.format;
        } else {
            key = 'generic';
        }

        if (error.keyword === 'errorMessage' && error.params.errors) {
            error.params.errors.forEach((err: any) => {
                if (typeof error.schema === 'object' && error.schema !== null) {
                    const msg = (error.schema as any)[err.keyword];
                    if (msg) {
                        result.push({
                            key,
                            message: msg
                        });
                    }
                }
            });
        } else if(error.message) {
            result.push({
                key,
                message: error.message
            });
        }
    });

    return result;
};

export const validate = (schema: IJsonSchema, data: unknown) => {
    const validator = ajv.compile(schema);
    const valid = validator(data);

    if (!valid) {
        const formattedErrors = formatErrors(validator.errors);

        throw new SchemaValidationError(
            'Validation failed',
            formattedErrors
        );
    }
    return data;
};

export const nestJsRouteHandlerBuilder = <
    INITIAL_QUERY_DTO extends Record<string, any> | undefined,
    HANDLERS extends readonly IUseCaseInlineFunc<any, unknown, any>[]
>(
    config: HandlerConfig<INITIAL_QUERY_DTO, HANDLERS>,
    options: IHandlerOptions = {}
) => {
    const {
        maxResponseSize = DEFAULT_MAX_RESPONSE_SIZE,
        headers = DEFAULT_SECURITY_HEADERS,
        corsOriginWhitelist
    } = options;

    return async (event: any, res: Response, next: Function) => {
        try {
            if (['POST', 'PUT'].includes(event?.httpMethod || event?.method) &&
                !event.headers['content-type']?.includes('application/json')) {
                const allowedOrigin = validateOrigin(event.headers.origin, corsOriginWhitelist);
                const errorBody = {
                    message: 'Content-Type must be application/json',
                    code: 500,
                    requestId: v4(),
                    timestamp: new Date().toISOString()
                };

                res.set({
                    ...headers,
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': allowedOrigin
                });

                return res.status(500).send(JSON.stringify(errorBody));
            }

            if (event.body && config.bodySchema) {
                const bodyData = JSON.parse(event.body);
                validate(config.bodySchema, bodyData);
            }

            const context: IBaseRequestContext = {
                headers: event.headers || {},
                method: event.method,
                path: event.path,
                body: event.body ? JSON.parse(event.body) : undefined,
                queryParameters: event.query || event.queryStringParameters || {},
                pathParameters: event.params || {},
                requestId: v4()
            };

            if (config.initialBodyReflector && context.body) {
                context.body = reflect(config.initialBodyReflector, context.body);
            }

            let initialQuery = config.initialQueryReflector
                ? reflect(config.initialQueryReflector, context)
                : ({} as IQueryType<INITIAL_QUERY_DTO>);

            let observable = from([initialQuery]);

            for (const createHandler of config.handlers) {
                observable = observable.pipe(
                    map((query) => {
                        const handler = createHandler(query, context);
                        const result = handler.execute(query);
                        return result instanceof Observable ? firstValueFrom(result) : result;
                    }),
                    switchMap(async result => result ?? null)
                );
            }

            if (config.timeoutMs) {
                observable = observable.pipe(
                    timeout({
                        first: config.timeoutMs,
                        with: () => { throw new RequestTimeoutError(); }
                    })
                );
            }

            const result = await firstValueFrom(observable).catch(error => {
                if (error instanceof EmptyError) return null;
                throw error;
            });

            const responseBody = JSON.stringify(result);
            if (Buffer.byteLength(responseBody) > maxResponseSize) {
                throw new PayloadTooLargeError();
            }

            const allowedOrigin = validateOrigin(event.headers.origin, corsOriginWhitelist);

            res.set({
                ...headers,
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': allowedOrigin
            });

            return res.status(200).send(responseBody);

        } catch (error) {
            const statusCode = getErrorStatusCode(error, config.errorToStatusCodeMapping);
            const requestId = v4();

            const errorBody: any = {
                message: error instanceof Error ? error.message : 'Unexpected error occurred',
                code: statusCode,
                requestId,
                timestamp: new Date().toISOString()
            };

            if (error instanceof SchemaValidationError && error.errors) {
                errorBody.validationErrors = error.errors;
            }

            const allowedOrigin = validateOrigin(event.headers.origin, corsOriginWhitelist);

            res.set({
                ...headers,
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': allowedOrigin
            });

            return res.status(statusCode).send(JSON.stringify(errorBody));
        }
    };
};

function getErrorStatusCode(error: unknown, mapping?: Record<number, Array<new (...args: any[]) => Error>>): number {
    if (!error || !(error instanceof Error)) return 500;

    const errorMapping = {
        400: [SchemaValidationError],
        408: [RequestTimeoutError],
        413: [PayloadTooLargeError],
        ...mapping
    };

    for (const [code, errorTypes] of Object.entries(errorMapping)) {
        if (errorTypes.some(type => error instanceof type)) {
            return parseInt(code, 10);
        }
    }

    return 500;
}