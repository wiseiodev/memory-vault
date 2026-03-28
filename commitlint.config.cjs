const linearFooterPattern =
  /(?:^|\n)(?:close|closes|closed|closing|fix|fixes|fixed|fixing|resolve|resolves|resolved|resolving|complete|completes|completed|completing)\s+[A-Z]+-\d+(?:,\s*[A-Z]+-\d+)*\s*$/im;

module.exports = {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        'linear-footer': (parsed) => {
          const raw = parsed.raw ?? '';

          return [
            linearFooterPattern.test(raw),
            'commit footer must include a Linear magic word like "Completes LAB-123"',
          ];
        },
      },
    },
  ],
  rules: {
    'body-leading-blank': [2, 'always'],
    'footer-leading-blank': [2, 'always'],
    'linear-footer': [2, 'always'],
    'subject-empty': [2, 'never'],
    'type-empty': [2, 'never'],
  },
};
