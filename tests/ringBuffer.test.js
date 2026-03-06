"use strict";

const { RingBuffer } = require("../src/utils/RingBuffer");

describe("RingBuffer", () => {
    test("inicia com size 0", () => {
        const buf = new RingBuffer(5);
        expect(buf.size).toBe(0);
        expect(buf.capacity).toBe(5);
    });

    test("lança RangeError para capacity inválida", () => {
        expect(() => new RingBuffer(0)).toThrow(RangeError);
        expect(() => new RingBuffer(-1)).toThrow(RangeError);
        expect(() => new RingBuffer(1.5)).toThrow(RangeError);
    });

    test("push incrementa size até capacity", () => {
        const buf = new RingBuffer(3);
        buf.push("a");
        expect(buf.size).toBe(1);
        buf.push("b");
        buf.push("c");
        expect(buf.size).toBe(3);
        buf.push("d"); // sobrescreve o mais antigo
        expect(buf.size).toBe(3);
    });

    test("toArray retorna itens do mais recente para o mais antigo", () => {
        const buf = new RingBuffer(5);
        buf.push(1);
        buf.push(2);
        buf.push(3);
        expect(buf.toArray()).toEqual([3, 2, 1]);
    });

    test("toArray com limit retorna apenas N itens mais recentes", () => {
        const buf = new RingBuffer(5);
        buf.push(1);
        buf.push(2);
        buf.push(3);
        expect(buf.toArray(2)).toEqual([3, 2]);
    });

    test("sobrescreve itens antigos quando cheio (circular)", () => {
        const buf = new RingBuffer(3);
        buf.push("a");
        buf.push("b");
        buf.push("c");
        buf.push("d"); // remove "a"
        buf.push("e"); // remove "b"

        expect(buf.toArray()).toEqual(["e", "d", "c"]);
        expect(buf.size).toBe(3);
    });

    test("toArray vazio retorna []", () => {
        const buf = new RingBuffer(3);
        expect(buf.toArray()).toEqual([]);
    });

    test("clear reseta o buffer", () => {
        const buf = new RingBuffer(3);
        buf.push(1);
        buf.push(2);
        buf.clear();
        expect(buf.size).toBe(0);
        expect(buf.toArray()).toEqual([]);
    });

    test("limit maior que size retorna todos", () => {
        const buf = new RingBuffer(10);
        buf.push("x");
        buf.push("y");
        expect(buf.toArray(100)).toEqual(["y", "x"]);
    });

    test("funciona com capacity 1", () => {
        const buf = new RingBuffer(1);
        buf.push("a");
        expect(buf.toArray()).toEqual(["a"]);
        buf.push("b");
        expect(buf.toArray()).toEqual(["b"]);
        expect(buf.size).toBe(1);
    });

    test("suporta grande volume sem erro", () => {
        const buf = new RingBuffer(100);
        for (let i = 0; i < 10000; i++) buf.push(i);
        expect(buf.size).toBe(100);
        const arr = buf.toArray();
        expect(arr[0]).toBe(9999);
        expect(arr[99]).toBe(9900);
    });
});
