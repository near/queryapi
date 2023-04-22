import AWSXRay from "aws-xray-sdk";

// Adapted from https://github.com/aws/aws-xray-sdk-node/issues/531#issuecomment-1378562164
// which is adapted from https://github.com/aws/aws-xray-sdk-node code that is Apache 2.0 licensed
 export default function traceFetch(actualFetch) {
    return async function (resource, options) {
        const traceHeader =
            resource.headers?.get('X-Amzn-Trace-Id') ?? options?.['X-Amzn-Trace-Id']

        if (!traceHeader) {
            const parent = AWSXRay.resolveSegment()

            if (parent) {
                const url = resource?.url ?? resource
                const method = resource?.method ?? options?.method ?? 'GET'
                const { hostname } = new URL(url)
                const subsegment = parent.notTraced
                    ? parent.addNewSubsegmentWithoutSampling(hostname)
                    : parent.addNewSubsegment(hostname)
                const root = parent.segment ? parent.segment : parent
                subsegment.namespace = 'remote'

                if (!options) {
                    options = {}
                }

                if (!options.headers) {
                    options.headers = {}
                }

                options.headers['X-Amzn-Trace-Id'] =
                    'Root=' +
                    root.trace_id +
                    ';Parent=' +
                    subsegment.id +
                    ';Sampled=' +
                    (subsegment.notTraced ? '0' : '1')

                subsegment.http = {
                    request: {
                        url,
                        method
                    }
                }

                try {
                    const res = await actualFetch.call(globalThis, resource, options)
                    if (res.status === 429) {
                        subsegment.addThrottleFlag()
                    } else if (!res.ok) {
                        subsegment.addErrorFlag()
                    }
                    const cause = AWSXRay.utils.getCauseTypeFromHttpStatus(res.status)
                    if (cause) {
                        subsegment[cause] = true
                    }
                    const contentLength = res.headers.get('content-length')
                    subsegment.http.response = {
                        status: res.status,
                        ...(contentLength && { content_length: contentLength })
                    }
                    subsegment.close()
                    return res
                } catch (err) {
                    subsegment.close(err)
                    throw err
                }
            }
        }

        return await actualFetch.call(globalThis, resource, options)
    }
}
