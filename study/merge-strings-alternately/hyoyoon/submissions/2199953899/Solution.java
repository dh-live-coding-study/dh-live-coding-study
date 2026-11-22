// want to know: time complexity of str.length() and it's internal implementation
class Solution {
    public String mergeAlternately(String word1, String word2) {
        StringBuilder sb = new StringBuilder();
        int len1 = word1.length();
        int len2 = word2.length();

        for (int i=0; i<Math.min(len1, len2); i++) {
            sb.append(word1.charAt(i))
                .append(word2.charAt(i));
        }

        // In this case, word1.substring(len2) throws exception
        if (len1 == len2) return sb.toString();
        if (len1 > len2) sb.append(word1.substring(len2));
        else sb.append(word2.substring(len1));

        return sb.toString();
    }
}
