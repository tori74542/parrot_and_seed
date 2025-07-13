/**
 * Generates a random number following a normal (Gaussian) distribution.
 * Uses the Box-Muller transform.
 * @returns {number} A random number from a standard normal distribution (mean 0, stddev 1).
 */
export const generateNormalRandom = (() => {
    let z1 = null;
    let generate = false;

    return () => {
        generate = !generate;

        if (!generate) {
            return z1;
        }

        let u1 = 0, u2 = 0;
        while (u1 === 0) u1 = Math.random(); // Converting [0,1) to (0,1)
        while (u2 === 0) u2 = Math.random();
        
        const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
        z1 = Math.sqrt(-2.0 * Math.log(u1)) * Math.sin(2.0 * Math.PI * u2);
        
        return z0;
    };
})();