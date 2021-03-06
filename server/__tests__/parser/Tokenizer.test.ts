import { Tokenizer, ITokenizedString } from '../../src/parser/Tokenizer';
import {
    emptySCL,
    emptySCLwithNewLines,
    simpleSCL1,
    complextSCL1_packagenotes,
    complextSCL2_2scl,
    invalidSCL_invalidEnding } from '../__resources__/sampleSCL';

// test only readNext()
const testbody = ((sclInput: string) => {
    const tokenizingTestFile: Tokenizer = new Tokenizer(sclInput);
    let nextStr: ITokenizedString = tokenizingTestFile.readNext();
    expect(nextStr).toMatchSnapshot();
    while(nextStr.value.length !== 0) {
        nextStr = tokenizingTestFile.readNext();
        expect(nextStr).toMatchSnapshot();
    }
});

// test also peekNext()
const testbody2 = ((sclInput: string) => {
    const tokenizingTestFile: Tokenizer = new Tokenizer(sclInput);
    let nextStr: ITokenizedString = tokenizingTestFile.peekNext();
    expect(nextStr).toEqual(tokenizingTestFile.readNext());
    expect(nextStr).toMatchSnapshot();
    while(nextStr.value.length !== 0) {
        nextStr = tokenizingTestFile.peekNext();
        expect(nextStr).toEqual(tokenizingTestFile.readNext());
        expect(nextStr).toMatchSnapshot();
    }
});

describe("Test a simple string", () => {
    it("", async () => {
        const input = "test";
        testbody(input);
        testbody2(input);
    });
});

describe("Test a simple string with unbalanced quotes", () => {
    it("", async () => {
        const input = "test '\"'\"test";
        testbody(input);
        testbody2(input);
    });
});

describe("Test an empty string", () => {
    it("", async () => {
        testbody(emptySCL);
        testbody2(emptySCL);
    });
});

describe("Test an empty string with new lines", () => {
    it("", async () => {
        testbody(emptySCLwithNewLines);
        testbody2(emptySCLwithNewLines);
    });
});

describe("Test a simple scl from resources", () => {
    it("", async () => {
        testbody(simpleSCL1);
        testbody2(simpleSCL1);
    });
});

describe("Test a complex scl with pkg notes from resources", () => {
    it("", async () => {
        testbody(complextSCL1_packagenotes);
        testbody2(complextSCL1_packagenotes);
    });
});

describe("Test a complex scl with 2 statements from resources", () => {
    it("", async () => {
        testbody(complextSCL2_2scl);
    });
});

describe("Test an invalid SCL that has invalid statement ending from resources", () => {
    it("", async () => {
        testbody(invalidSCL_invalidEnding);
        testbody2(invalidSCL_invalidEnding);
    });
});