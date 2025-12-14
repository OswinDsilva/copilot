export type PollCheckResult<T> = {done: true; result?: T} | {done: false; progress?: number; message?: string};

export type PollCheckFn<T> = (opt?: {signal? : AbortSignal}) => Promise<PollCheckResult<T>>;

export type PollOptions = {
    // total timeout, default : 60000
    timeoutMs?: number;
    //first delay, default : 500
    initialDelayMs?: number;
    //cap the maximum delay to avoid excessively long waits, default : 10000 
    maxDelayMs?: number;        
    maxAttempts?: number;
    // multiplier for exponential backoff, default : 1.6
    backoffMultiplier?: number;
    // add some random variation to delay times to avoid multiple retries at the same time causing spikes, default : true
    jitter?: boolean;
    throwOnError?: boolean;
    signal?: AbortSignal;
};

export type PollProgress = { 
    attempts: number;
    lastDelayMs?: number;
    progress?: number;
    message?: string;
};

export type PollResult<T> = {
    result?: T;
    progress: PollProgress;
};

export class PollCancelledError extends Error {
    constructor(message = 'Polling cancelled'){
        super(message);
        this.name = 'PollCancelledError';
    }
}

export class PollTimeoutError extends Error {
    constructor(message = 'Polling timed out'){
        super(message);
        this.name = 'PollTimeoutError';
    }
}

export class PollFailedError extends Error {
    constructor(message = 'Polling failed'){
        super(message);
        this.name = 'PollFailedError';
    }
}

function sleep(ms : number, signal?: AbortSignal) : Promise<void>{
    return new Promise((resolve, reject) => {
        let finished = false;
        let id: ReturnType<typeof setTimeout> | undefined;

        function cleanup(){
            if(finished) 
                return;
            finished = true;
            if(typeof id !== 'undefined')
                clearTimeout(id);

            signal?.removeEventListener('abort', onAbort);
        }
    
        function onAbort(){
            if(finished) 
                return;
            cleanup();
            reject(new PollCancelledError());
        }

        signal?.addEventListener('abort', onAbort);

        if(signal?.aborted){
            onAbort();
            return;
        }

        id = setTimeout(() => {
            if(finished)
                return;
            cleanup();
            resolve();
        }, ms);
        
    });
}

function applyJitter(ms : number, fraction = 0.3) : number {
    const rand = Math.random() * 2 - 1; // random number between -1 and +1
    const multiplier = 1 + rand * fraction;
    const jittered = Math.round(ms * multiplier);
    return Math.max(0, jittered);
}



export async function pollWithBackoff<T>(checkFn: PollCheckFn<T>, options: PollOptions = {}): Promise<PollResult<T>> {
    const {
        timeoutMs = 60000,
        initialDelayMs = 500,
        maxDelayMs = 10000,
        maxAttempts,
        backoffMultiplier = 1.6,
        jitter = true,
        throwOnError = true,
        signal
    }  = options;

    let startTime = Date.now();
    let attempts = 0;
    let delayMs = initialDelayMs;
    let progress: PollProgress = {attempts : 0}; 

    if (signal && signal.aborted === true) {
        throw new PollCancelledError();
    }
    
    while(true){
        const elapsedTime = Date.now() - startTime;
        if(elapsedTime >= timeoutMs){
            throw new PollTimeoutError(`Polling timed out after ${elapsedTime} ms (limit ${timeoutMs} ms)`);
        }

        attempts++;
        progress.attempts = attempts;

        if(signal && signal.aborted === true) {
            throw new PollCancelledError();
        }

        let response : PollCheckResult<T> | undefined;
        try {
            response = await checkFn({signal});
        }
        catch(err){
            const msg = err instanceof Error ? err.message : String(err);
            if (throwOnError === true){
                throw new PollFailedError(msg);

            }
            else{
                response = {done: false, message: msg};
                progress.message = msg;
            }
        }
        
        if (response && response.done === true) {
            return {result: response.result, progress};
        }
        else if(response && response.done === false){
            if (typeof response.progress === 'number'){
                progress.progress = response.progress;
            }
            if(typeof response.message === 'string'){
                progress.message = response.message;
            }
        }

        if(typeof maxAttempts === 'number' && attempts >= maxAttempts){
            throw new PollFailedError(`Maximum polling attempts exceeded (${attempts}/${maxAttempts})`);
        }


        // Randomizes the delay 
        // Fraction decides the variation range i.e 0.3 is +/- 30%
        // (Math.random() * 2 - 1) gives a random number between -1 and +1
        let waitMs = delayMs;
        let fraction = 0.3 ;
        if (jitter === true){
            waitMs = applyJitter(delayMs, fraction);  
        }
        waitMs = Math.max(0, Math.round(waitMs));
        
        const remaining = timeoutMs - elapsedTime;
        if(remaining <= 0){
            throw new PollTimeoutError(`Polling timed out after ${elapsedTime} ms (limit ${timeoutMs} ms)`);
        }
        
        const actualWaitMs = Math.min(waitMs, remaining);
        progress.lastDelayMs = actualWaitMs;
        await sleep(actualWaitMs, signal);
        
        delayMs = Math.min(maxDelayMs, Math.round(delayMs * backoffMultiplier));
    }
}




    
