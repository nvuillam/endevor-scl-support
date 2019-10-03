import { TextDocument, Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { ITokenizedString, Tokenizer } from '../parser/Tokenizer';
import { isNullOrUndefined } from 'util';
import { SCLDocumentManager } from './SCLDocumentManager';
import { match } from '../parser/ParserTags';
import { parseSETSCL } from '../parser/syntaxTrees/SETCommands';

/**
 * An interface that extends the vscode diagnostic.
 * starti and endi is the range of diagnostic. This is used when updating document.
 * We first calculate the starti and endi, then update the diagnostic.range
 *
 * @export
 * @interface ISCLDiagnostic
 */
export interface ISCLDiagnostic {
    diagnostic: Diagnostic;
    starti: number;
    endi: number;
}

/**
 * Informaton about one scl statement.
 * Its tokens. Where it start and end. It's diagnostic information
 *
 * @export
 * @class SCLstatement
 */
export class SCLstatement {
    starti: number;
    endi: number;
    tokens: ITokenizedString[] = [];
    diagnostics: ISCLDiagnostic[] = [];

    /**
     * Creates an instance of SCLstatement from tokens.
     *
     * @param {ITokenizedString[]} tokens
     * @param {number} [startiOffset] The offset for all the indexes in the object to be created
     * @memberof SCLstatement
     */
    constructor(tokens: ITokenizedString[], startiOffset?: number) {
        if (isNullOrUndefined(startiOffset)) {
            startiOffset = 0;
        }

        this.starti = tokens[0].starti + startiOffset;
        this.endi = tokens[tokens.length-1].starti + tokens[tokens.length-1].value.length + startiOffset;
        if (startiOffset === 0) {
            this.tokens = tokens;
        } else {
            tokens.forEach((token) => {
                token.starti += startiOffset as number;
                this.tokens.push(token);
            });
        }
        this.tokens = tokens;
        this.diagnostics = [];
    }
}

/**
 * Information about an entire document.
 * Its content info. Its scl statements.
 *
 * @export
 * @class SCLDocument
 */
export class SCLDocument {
    textDocument: TextDocument;
    statements: SCLstatement[] = [];

    constructor(textDocument: TextDocument) {
        this.textDocument = textDocument;
        this.initStatements(); // read the whole content of the document and do synatx diagnose
    }

    /**
     * Tokenize the input string into an array of SCLstatement
     *
     * @private
     * @param {string} text
     * @param {number} [startiOffset] The offset for the current text in the whole document
     * @returns {SCLstatement[]}
     * @memberof SCLDocument
     */
    private parseTextIntoSCLstatementsTokens(text: string, startiOffset?: number): SCLstatement[] {
        const statements: SCLstatement[] = [];
        const tokenizeTextContent: Tokenizer = new Tokenizer(text);
        let token: ITokenizedString = tokenizeTextContent.peekNext();
        let statement: ITokenizedString[] = [];
        while (!isNullOrUndefined(token) && !token.is_eoInput) {
            token = tokenizeTextContent.readNext();

            if (token.is_eoInput) {
                if (statement.length > 0) {
                    statements.push(new SCLstatement(statement, startiOffset));
                }
                break;
            }

            statement.push(token);

            if (token.is_eoStatement) {
                statements.push(new SCLstatement(statement, startiOffset));
                statement = [];
            }
        }
        return statements;
    }

    /**
     * Parse the whole document into an array of scl statements, and do synatx diagnose
     *
     * @private
     * @returns
     * @memberof SCLDocument
     */
    private initStatements() {
        if (isNullOrUndefined(this.textDocument)) {
            this.statements = [];
            return;
        }
        this.statements = this.parseTextIntoSCLstatementsTokens(this.textDocument.getText());
        this.walkStatements();
    }

    /**
     * Walk through all statements in this document to generate all information we need to send to client,
     * e.g. diagnoses, completion, quickfixes, highlights, hovers ...
     *
     * @private
     * @memberof SCLDocument
     */
    private walkStatements() {
        this.statements.forEach((scl) => { this.walkStatement(scl); });
    }

    /**
     * Walk though one statement
     *
     * @private
     * @param {SCLstatement} statement
     * @memberof SCLDocument
     */
    private walkStatement(statement: SCLstatement) {
        if (match(statement.tokens[0], "T_SET", statement, this)) {
            parseSETSCL(statement, this);
        }
        else {
            // TODO dispatch SCL
        }
    }

    /**
     * Called by SCLDocumentManager when an update in the document is received
     *
     * @param {string} newText The new text replacing the original text
     * @param {number} start The start index of the original text
     * @param {number} end The end index of the original text
     * @memberof SCLDocument
     */
    update(newText: string, start: number, end: number, origContent: string) {
        const oldLength = end - start;
        const indexPlus = newText.length - oldLength;

        const updatePositionInStatement = ((indexPlus: number, statement: SCLstatement) => {
            statement.starti = statement.starti + indexPlus;
            statement.endi = statement.endi + indexPlus;
            for (const token of statement.tokens) {
                token.starti = token.starti + indexPlus;
            }
            for (const diag of statement.diagnostics) {
                diag.starti = diag.starti + indexPlus;
                diag.endi = diag.endi + indexPlus;
                // the diag.diagnostic.range will be refreshed after all the updates are processed, and textDocument is updated
            }
        });

        let affectedRange = {
            start,
            end
        }; // the start and end index in the textDocument, of where the change affected
        for (let i = this.statements.length - 1; i >= 0 ; -- i) {
            if (this.statements[i].starti > affectedRange.end) {
                // start end statement.starti statement.endi
                updatePositionInStatement(indexPlus, this.statements[i]);
                continue;
            } else if (this.statements[i].endi < affectedRange.start) {
                // statement.starti statement.endi start end, and statement is a complete statement
                const lastToken = this.statements[i].tokens[this.statements[i].tokens.length-1];
                if (lastToken.is_eoStatement) {
                    continue;
                }
            }
            affectedRange.start = Math.min(
                affectedRange.start, this.statements[i].starti);
            affectedRange.end = Math.max(
                affectedRange.end, this.statements[i].endi);

            // before remove this statement, update SCLDocumentManager.numberOfProblems
            SCLDocumentManager.numberOfProblems = SCLDocumentManager.numberOfProblems - this.statements[i].diagnostics.length;
            if (SCLDocumentManager.numberOfProblems < 0) {
                SCLDocumentManager.numberOfProblems = 0;
            }
            this.statements.splice(i, 1);
        }

        const newTextTobeParse: string = origContent.substring(affectedRange.start, start)
                                            + newText
                                            + origContent.substring(end, affectedRange.end);
        const newStatements: SCLstatement[] = this.parseTextIntoSCLstatementsTokens(newTextTobeParse, affectedRange.start);
        newStatements.forEach((newscl) => {
            this.walkStatement(newscl);
            this.statements.push(newscl);
        });
    }

    /**
     * Push diagnostic information into the corresponded SCLstatement
     *
     * @param {ITokenizedString} diagnosedToken the token where the error/warning happened
     * @param {SCLstatement} statement the scl statement where the error/warning happened
     * @param {DiagnosticSeverity} severity
     * @param {string} message
     * @param {string} [relatedMsg]
     * @returns
     * @memberof SCLDocument
     */
    pushDiagnostic(
        diagnosedToken: ITokenizedString,
        statement: SCLstatement,
        severity: DiagnosticSeverity,
        message: string,
        relatedMsg?: string,
        ) {

        if (SCLDocumentManager.numberOfProblems > SCLDocumentManager.config.maxNumberOfProblems) {
            return;
        }
        if (diagnosedToken.starti < statement.starti ||
            diagnosedToken.starti + diagnosedToken.value.length > statement.endi) {
            // The token is not in the scl!!
            return;
        }

        SCLDocumentManager.numberOfProblems ++;

        let diagnostic: Diagnostic = {
            severity: severity,
            range: {
                start: this.textDocument.positionAt(diagnosedToken.starti),
                end: this.textDocument.positionAt(diagnosedToken.starti + diagnosedToken.value.length)
            },
            message: message,
            source: 'Endevor SCL extension'
        };
        if (SCLDocumentManager.capabilities.hasDiagnosticRelatedInformationCapability && !isNullOrUndefined(relatedMsg)) {
            diagnostic.relatedInformation = [
                {
                    location: {
                        uri: this.textDocument.uri,
                        range: Object.assign({}, diagnostic.range)
                    },
                    message: relatedMsg,
                }
            ];
        }
        statement.diagnostics.push({
            diagnostic,
            starti: diagnosedToken.starti,
            endi: diagnosedToken.starti + diagnosedToken.value.length,
        });
    }
}