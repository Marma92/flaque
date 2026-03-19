import React from "react";

type AcronymProps = {
    text: string;
    expansions: Record<string, string>;
};

function tokenize(text: string, expansions: Record<string, string>) {
    const keys = Object.keys(expansions).sort((a, b) => b.length - a.length);
    const tokens: string[] = [];

    let i = 0;

    while (i < text.length) {
        let matched = false;

        for (const key of keys) {
            if (text.slice(i, i + key.length) === key) {
                tokens.push(key);
                i += key.length;
                matched = true;
                break;
            }
        }

        if (!matched) {
            tokens.push(text[i]);
            i++;
        }
    }

    return tokens;
}

export const Acronym: React.FC<AcronymProps> = ({ text, expansions }) => {
    const tokens = tokenize(text, expansions);

    return (
        <div className="acronym">
            {tokens.map((token, index) => {
                const expansion = expansions[token];

                return (
                    <span key={index} className="letter-group">
                        <span className="base-letter">{token}</span>
                        {expansion && (
                            <span className="expansion">{expansion}</span>
                        )}
                    </span>
                );
            })}
        </div>
    );
};