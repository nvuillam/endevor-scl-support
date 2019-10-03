import {
    TextDocument,
    TextDocumentItem,
    VersionedTextDocumentIdentifier,
    TextDocumentContentChangeEvent } from "vscode-languageserver";
import { SCLDocument } from "./SCLDocument";
import { isNull, isNullOrUndefined } from "util";


interface IDocumentSettings {
    maxNumberOfProblems: number;
}

interface ICapabilities {
    hasDiagnosticRelatedInformationCapability: boolean;
}

/**
 * Manage all the opened documents in the client
 *
 * @export
 * @class SCLDocumentManager
 */
export class SCLDocumentManager {
    static config: IDocumentSettings = { maxNumberOfProblems: 1000 };
    static capabilities: ICapabilities = { hasDiagnosticRelatedInformationCapability: false };

    static numberOfProblems = 0; // TODO, now I'm accessing it from everywhere, not sure if it is the best

    // a map of document uri to document details
    documents: Map<string, SCLDocument> = new Map();

    constructor() {
        this.documents = new Map();
    }

    openDocument(textDocumentItem: TextDocumentItem): SCLDocument {
        const textDocument: TextDocument = TextDocument.create(
            textDocumentItem.uri, textDocumentItem.languageId, textDocumentItem.version, textDocumentItem.text);
        const document: SCLDocument = new SCLDocument(textDocument);
        this.documents.set(textDocument.uri, document);

        // no need to refresh the diagnose number, since it is dealt with in SCLDocument.pushDiagnostic
        return document;
    }

    closeDocument(textDocumentUri: string): void {
        const document = this.documents.get(textDocumentUri);
        if (isNullOrUndefined(document)) {
            return;
        }

        // refresh the diagnose number
        let decreaseNum = 0;
        document.statements.forEach((statement) => {
            decreaseNum += statement.diagnostics.length;
        });
        SCLDocumentManager.numberOfProblems = SCLDocumentManager.numberOfProblems - decreaseNum;
        if (SCLDocumentManager.numberOfProblems < 0) {
            SCLDocumentManager.numberOfProblems = 0;
        }

        this.documents.delete(textDocumentUri);
    }

    updateDocument(
        textDocument: VersionedTextDocumentIdentifier,
        contentChanges: TextDocumentContentChangeEvent[]): SCLDocument {

        const document = this.documents.get(textDocument.uri);
        if (!document) {
            throw new Error(`Cannot update unopened document: ${textDocument.uri}`);
        }

        // When we get the TextDocumentContentChangeEvent[] from vscode, it is sorted.
        // The changes at the end of the document will be returned first.
        // This is really nice, because if we process changes in the beginning first,
        // then all indexes in scl statements will shift for changes after, and it is hard to deal with.
        // But since we get the change in the end first, and no matter how much the change shift the index of the content after it,
        // it won't affect the index of the scl statements before it, and therefore not affecting the changes in front.
        let originalContent = document.textDocument.getText();
        let newContent = originalContent;
        for (const change of contentChanges) {
            let start = 0;
            let end = 0;
            if (!change.range) {
                end = document.textDocument.getText().length;
            } else {
                start = document.textDocument.offsetAt(change.range.start);
                end = document.textDocument.offsetAt(change.range.end);
            }

            document.update(change.text, start, end, newContent);

            newContent = newContent.substring(0, start)
                            + change.text
                            + newContent.substring(end, newContent.length);
        }
        // refresh TextDocument after all changes are processed
        document.textDocument = TextDocument.create(
            document.textDocument.uri, document.textDocument.languageId,
            isNull(textDocument.version) ? document.textDocument.version : textDocument.version,
            newContent);

        // refresh the "range" in diagnose based on the new textDocument
        document.statements.forEach((statement) => {
            statement.diagnostics.forEach((diag) => {
                diag.diagnostic.range.start = document.textDocument.positionAt(diag.starti);
                diag.diagnostic.range.end = document.textDocument.positionAt(diag.endi);
            });
        });

        this.documents.set(textDocument.uri, document);

        // no need to refresh the diagnose number, since it is dealt with in SCLDocument.update and SCLDocument.pushDiagnostic
        return document;
    }
}