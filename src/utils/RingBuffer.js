"use strict";

/**
 * RingBuffer — buffer circular de tamanho fixo.
 *
 * Armazena até `capacity` itens. Quando cheio, o item mais antigo é sobrescrito.
 * Operações push e toArray são O(1) e O(n) respectivamente.
 * Evita o custo de Array.unshift() + slice() que era O(n) por inserção.
 */
class RingBuffer {
    /** @type {Array<any>} */
    #buffer;

    /** @type {number} */
    #capacity;

    /** @type {number} Posição de escrita (ponteiro circular) */
    #head = 0;

    /** @type {number} Quantidade de itens armazenados */
    #size = 0;

    /**
     * @param {number} capacity - Tamanho máximo do buffer
     */
    constructor(capacity) {
        if (!Number.isInteger(capacity) || capacity <= 0) {
            throw new RangeError("RingBuffer capacity must be a positive integer");
        }
        this.#capacity = capacity;
        this.#buffer = new Array(capacity);
    }

    /** Número de itens atualmente armazenados */
    get size() { return this.#size; }

    /** Capacidade máxima */
    get capacity() { return this.#capacity; }

    /**
     * Adiciona item ao buffer. Se cheio, sobrescreve o mais antigo.
     * @param {any} item
     */
    push(item) {
        this.#buffer[this.#head] = item;
        this.#head = (this.#head + 1) % this.#capacity;
        if (this.#size < this.#capacity) this.#size++;
    }

    /**
     * Retorna os itens do mais recente para o mais antigo.
     * @param {number} [limit] - Máximo de itens a retornar
     * @returns {Array<any>}
     */
    toArray(limit) {
        const count = limit ? Math.min(limit, this.#size) : this.#size;
        const result = new Array(count);

        for (let i = 0; i < count; i++) {
            // Lê de trás para frente a partir do head
            const idx = (this.#head - 1 - i + this.#capacity) % this.#capacity;
            result[i] = this.#buffer[idx];
        }

        return result;
    }

    /**
     * Remove todos os itens do buffer.
     */
    clear() {
        this.#buffer = new Array(this.#capacity);
        this.#head = 0;
        this.#size = 0;
    }
}

module.exports = { RingBuffer };
